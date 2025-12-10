import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import type { Database, Tables } from "@/database.types";
import crypto from "node:crypto";
import { DateTime } from "luxon";

type Profile = Tables<"profiles">;

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev if not set
  const authHeader = req.headers.get("authorization") || req.headers.get("x-cron-secret");
  if (!authHeader) return false;
  if (authHeader === secret) return true;
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7) === secret;
  }
  return false;
}

function buildAckToken(id: string): string {
  const secret = process.env.ACK_SECRET || "dev-ack-secret";
  return crypto.createHmac("sha256", secret).update(id).digest("hex");
}

function buildAckUrl(origin: string, id: string): string {
  const token = buildAckToken(id);
  const u = new URL("/api/nudges/ack", origin);
  u.searchParams.set("i", id);
  u.searchParams.set("t", token);
  return u.toString();
}

function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}

function parseTimeToUTCISO(localTime: string, tz: string): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const zone = tz || "UTC";
  const localNow = DateTime.now().setZone(zone);
  if (!localNow.isValid) return null;
  const scheduledLocal = DateTime.fromObject(
    { year: localNow.year, month: localNow.month, day: localNow.day, hour, minute, second: 0, millisecond: 0 },
    { zone: zone }
  );
  if (!scheduledLocal.isValid) return null;
  return scheduledLocal.toUTC().toISO();
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const supabase = createAdminClient();

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id,email,name");

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const { data: configs } = await supabase.from("nudge_configs").select("*");
  const confByUser = new Map<string, Database["public"]["Tables"]["nudge_configs"]["Row"]>();
  (configs ?? []).forEach((c) => confByUser.set(c.user_id, c));

  // Ensure today's nudges exist per user using timezone-aware conversion
  const ensurePromises: Promise<unknown>[] = [];
  for (const p of profiles ?? []) {
    const conf = confByUser.get(p.id);
    if (conf && conf.enabled === false) continue;
    const times = conf?.times ?? ["09:00", "13:00", "17:00"];
    const timezone = (conf?.timezone && conf.timezone.trim()) || "UTC";

    for (const t of times) {
      ensurePromises.push(
        (async () => {
          const scheduledISO = parseTimeToUTCISO(t, timezone);
          if (!scheduledISO) return;

          const { data: exists } = await supabase
            .from("nudges")
            .select("id")
            .eq("user_id", p.id)
            .eq("scheduled_at", scheduledISO)
            .maybeSingle();

          if (!exists) {
            await supabase.from("nudges").insert({
              user_id: p.id,
              scheduled_at: scheduledISO,
              status: "scheduled",
            } satisfies Database["public"]["Tables"]["nudges"]["Insert"]);
            // eslint-disable-next-line no-console
            console.log(`[NUDGES CRON] Created scheduled nudge for user ${p.id} at ${scheduledISO}`);
          }
        })()
      );
    }
  }
  await Promise.all(ensurePromises);

  // Send due nudges
  const nowISO = new Date().toISOString();
  const { data: dueNudges, error: nErr } = await supabase
    .from("nudges")
    .select("*")
    .lte("scheduled_at", nowISO)
    .is("sent_at", null);

  if (nErr) {
    return NextResponse.json({ error: nErr.message }, { status: 500 });
  }

  let sentCount = 0;
  for (const nudge of dueNudges ?? []) {
    const userId = nudge.user_id;
    const prof = (profiles ?? []).find((x) => x.id === userId) as Profile | undefined;
    const email = prof?.email ?? "";
    const name = prof?.name || email || "there";

    const { data: myTasks } = await supabase.from("tasks").select("*").eq("owner_id", userId);

    const todayDate = DateTime.now().toISODate() ?? new Date().toISOString().slice(0, 10);
    const todayEnd = DateTime.fromISO(`${todayDate}T23:59:59.999Z`).toMillis();

    const overdue = (myTasks ?? []).filter(
      (t) => t.status !== "done" && DateTime.fromISO(`${t.due_date}T23:59:59Z`).toMillis() < Date.now()
    );
    const dueToday = (myTasks ?? []).filter((t) => t.status !== "done" && t.due_date === todayDate);
    const dueSoon = (myTasks ?? []).filter((t) => {
      if (t.status === "done") return false;
      const due = DateTime.fromISO(`${t.due_date}T23:59:59Z`).toMillis();
      const diffDays = Math.floor((due - todayEnd) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 1;
    });

    const payload = {
      counts: {
        overdue: overdue.length,
        dueToday: dueToday.length,
        dueSoon: dueSoon.length,
        open: (myTasks ?? []).filter((t) => t.status !== "done").length,
        done: (myTasks ?? []).filter((t) => t.status === "done").length,
      },
      sample: {
        overdue: overdue.slice(0, 3).map((t) => ({ id: t.id, title: t.title, due: t.due_date })),
        dueToday: dueToday.slice(0, 3).map((t) => ({ id: t.id, title: t.title })),
        dueSoon: dueSoon.slice(0, 3).map((t) => ({ id: t.id, title: t.title, due: t.due_date })),
      },
    };

    const ackUrl = buildAckUrl(origin, nudge.id);
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.5; color:#111;">
        <h2>Hi ${htmlEscape(name)}, quick task check-in ⚡</h2>
        <p>Here's a snapshot:</p>
        <ul>
          <li><strong>Overdue:</strong> ${payload.counts.overdue}</li>
          <li><strong>Due today:</strong> ${payload.counts.dueToday}</li>
          <li><strong>Due soon:</strong> ${payload.counts.dueSoon}</li>
          <li><strong>Open:</strong> ${payload.counts.open}</li>
          <li><strong>Done:</strong> ${payload.counts.done}</li>
        </ul>
        <p>Tap below once you've reviewed or updated your tasks:</p>
        <p><a href="${ackUrl}" target="_blank" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">I'm up to date</a></p>
        <p style="font-size:12px;color:#555;">This link records your acknowledgement.</p>
      </div>
    `;

    if (email) {
      // eslint-disable-next-line no-console
      console.log(`[NUDGES CRON] Sending nudge ${nudge.id} to user ${userId} (${email}) scheduled_at ${nudge.scheduled_at}`);
      const res = await sendEmail({
        to: email,
        subject: "Your FlowTrack nudge",
        html,
      });

      if (res.ok) {
        await supabase
          .from("nudges")
          .update({ sent_at: new Date().toISOString(), status: "sent", payload })
          .eq("id", nudge.id);
        sentCount += 1;
        // eslint-disable-next-line no-console
        console.log(`[NUDGES CRON] Marked nudge ${nudge.id} as sent.`);
      } else {
        await supabase.from("nudges").update({ status: "failed" }).eq("id", nudge.id);
        // eslint-disable-next-line no-console
        console.log(`[NUDGES CRON] Failed to send nudge ${nudge.id}.`);
      }
    } else {
      await supabase.from("nudges").update({ status: "failed" }).eq("id", nudge.id);
      // eslint-disable-next-line no-console
      console.log(`[NUDGES CRON] No email for user ${userId}. Marked nudge ${nudge.id} as failed.`);
    }
  }

  return NextResponse.json({
    ensured_for_users: profiles?.length ?? 0,
    nudges_sent: sentCount,
  });
}
