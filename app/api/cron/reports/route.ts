import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import type { Tables } from "@/database.types";

type Profile = Tables<"profiles">;
type Task = Tables<"tasks">;

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

function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
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

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const today = todayUtcDateStr();

  // 1) Fetch managers
  const { data: managers, error: mErr } = await supabase
    .from("profiles")
    .select("id,email,name,role")
    .eq("role", "manager");

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  let sentCount = 0;

  for (const manager of managers ?? []) {
    // 2) Team members: profiles with manager_id = manager.id
    const { data: team } = await supabase
      .from("profiles")
      .select("id,name,email")
      .eq("manager_id", manager.id);

    const teamIds = (team ?? []).map((t) => t.id);
    if (teamIds.length === 0) {
      // still send empty report to keep cadence
      const html = `
        <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.5; color:#111;">
          <h2>Daily team report</h2>
          <p>No team members assigned yet.</p>
        </div>
      `;
      if (manager.email) {
        await sendEmail({
          to: manager.email,
          subject: "FlowTrack - Daily team report (no team yet)",
          html,
        });
        sentCount += 1;
      }
      continue;
    }

    // 3) Fetch tasks for the team
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .in("owner_id", teamIds);

    // 4) Compute per-user stats
    const perUser: Record<
      string,
      {
        name: string;
        completedToday: number;
        open: number;
        overdue: number;
        dueSoon: number;
      }
    > = {};

    const todayEnd = new Date(`${today}T23:59:59.999Z`).getTime();

    for (const member of team ?? []) {
      perUser[member.id] = {
        name: member.name || member.email || "Unknown",
        completedToday: 0,
        open: 0,
        overdue: 0,
        dueSoon: 0,
      };
    }

    for (const t of tasks ?? []) {
      const user = perUser[t.owner_id];
      if (!user) continue;

      const isDone = t.status === "done";
      const updatedDate = t.updated_at.slice(0, 10);
      const isCompletedToday = isDone && updatedDate === today;

      if (isCompletedToday) user.completedToday += 1;
      if (!isDone) {
        user.open += 1;
        const due = new Date(`${t.due_date}T23:59:59Z`).getTime();
        if (due < Date.now()) {
          user.overdue += 1;
        } else {
          const diffDays = Math.floor((due - todayEnd) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 1) {
            user.dueSoon += 1;
          }
        }
      }
    }

    // 5) Compose and upsert manager_report row
    const summary = {
      date: today,
      perUser,
    };

    // Upsert (select existing for this date)
    const { data: existing } = await supabase
      .from("manager_reports")
      .select("id")
      .eq("manager_id", manager.id)
      .eq("report_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("manager_reports")
        .update({ summary, status: "sent", sent_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("manager_reports").insert({
        manager_id: manager.id,
        report_date: today,
        summary,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    }

    // 6) Email the manager
    const rowsHtml = Object.values(perUser)
      .map(
        (u) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #eee;">${htmlEscape(u.name)}</td>
        <td style="padding:8px 12px;border:1px solid #eee;">${u.completedToday}</td>
        <td style="padding:8px 12px;border:1px solid #eee;">${u.open}</td>
        <td style="padding:8px 12px;border:1px solid #eee;">${u.overdue}</td>
        <td style="padding:8px 12px;border:1px solid #eee;">${u.dueSoon}</td>
      </tr>`
      )
      .join("");

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.5; color:#111;">
        <h2>Daily team report for ${today}</h2>
        <table style="border-collapse: collapse; width:100%; font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 12px;border:1px solid #eee;">Team member</th>
              <th style="text-align:left;padding:8px 12px;border:1px solid #eee;">Completed today</th>
              <th style="text-align:left;padding:8px 12px;border:1px solid #eee;">Open</th>
              <th style="text-align:left;padding:8px 12px;border:1px solid #eee;">Overdue</th>
              <th style="text-align:left;padding:8px 12px;border:1px solid #eee;">Due soon</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="5" style="padding:8px 12px;border:1px solid #eee;">No data</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    if (manager.email) {
      await sendEmail({
        to: manager.email,
        subject: "FlowTrack - Daily team report",
        html,
      });
      sentCount += 1;
    }
  }

  return NextResponse.json({
    reports_sent: sentCount,
    managers_considered: managers?.length ?? 0,
  });
}
