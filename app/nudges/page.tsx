"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/database.types";

type NudgeRow = Tables<"nudges">;

function fmt(dtIso: string | null): string {
  if (!dtIso) return "—";
  const d = new Date(dtIso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function NudgesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        supabase
          .from("nudges")
          .select("*")
          .eq("user_id", uid)
          .order("scheduled_at", { ascending: false })
          .then(({ data }) => {
            setNudges(data ?? []);
          });
      }
    });
  }, [supabase]);

  async function acknowledge(id: string) {
    const { data, error } = await supabase
      .from("nudges")
      .update({ acknowledged_at: new Date().toISOString(), status: "acknowledged" })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      setToast(error.message);
      return;
    }
    if (data) {
      setNudges((prev) => prev.map((n) => (n.id === data.id ? data : n)));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto max-w-4xl px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">Your Nudge History</h1>
        <p className="text-sm text-white/70 mt-1">Review reminders and acknowledgements.</p>

        <div className="mt-6 space-y-3">
          {nudges.map((n) => (
            <div key={n.id} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    Scheduled: <span className="text-white/80">{fmt(n.scheduled_at)}</span>
                  </p>
                  <p className="text-sm">
                    Sent: <span className="text-white/80">{fmt(n.sent_at)}</span>
                  </p>
                  <p className="text-sm">
                    Acknowledged: <span className="text-white/80">{fmt(n.acknowledged_at)}</span>
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    n.status === "acknowledged"
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                      : n.status === "sent"
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30"
                      : n.status === "failed"
                      ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30"
                      : "bg-white/10 text-white ring-1 ring-white/20"
                  }`}
                >
                  {n.status}
                </span>
              </div>
              {n.status === "sent" && !n.acknowledged_at && userId && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => acknowledge(n.id)}
                    className="rounded-xl bg-white text-slate-900 font-medium px-3 py-2 shadow hover:shadow-md transition text-sm"
                  >
                    Mark acknowledged
                  </button>
                </div>
              )}
              {n.payload && (
                <div className="mt-3 rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
                  <p className="text-xs text-white/60">Snapshot</p>
                  <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all">
                    {JSON.stringify(n.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {nudges.length === 0 && (
            <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center">
              <p className="text-white/80">No nudges yet.</p>
            </div>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/30 px-4 py-3 text-sm">
            {toast}
            <button
              type="button"
              className="ml-3 text-rose-300 underline underline-offset-4"
              onClick={() => setToast("")}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
