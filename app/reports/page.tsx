"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/database.types";

type ReportRow = Tables<"manager_reports">;
type Profile = Tables<"profiles">;

function fmtDate(d: string): string {
  try {
    const coerced = new Date(`${d}T00:00:00`);
    if (Number.isNaN(coerced.getTime())) return d;
    return coerced.toLocaleDateString();
  } catch {
    return d;
  }
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Profile | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [toast, setToast] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (!prof) return;
      setMe(prof);
      if (prof.role !== "manager") {
        setReports([]);
        return;
      }
      const { data: rows, error } = await supabase
        .from("manager_reports")
        .select("*")
        .eq("manager_id", uid)
        .order("report_date", { ascending: false });
      if (error) {
        setToast(error.message);
        return;
      }
      setReports(rows ?? []);
    });
  }, [supabase]);

  if (me && me.role !== "manager") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white grid place-items-center">
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-8 text-center">
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-2 text-white/70 text-sm">Only managers can view team reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto max-w-4xl px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">Manager Reports</h1>
        <p className="text-sm text-white/70 mt-1">Browse past daily summaries.</p>

        <div className="mt-6 space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Report date: <span className="text-white/80">{fmtDate(r.report_date)}</span></p>
                  <p className="text-sm">Status: <span className="text-white/80">{r.status}</span></p>
                  <p className="text-sm">Sent: <span className="text-white/80">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</span></p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-white/10 text-white ring-1 ring-white/20">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.summary && (
                <div className="mt-3 rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
                  <p className="text-xs text-white/60">Summary</p>
                  <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all">
                    {JSON.stringify(r.summary, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && (
            <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center">
              <p className="text-white/80">No reports found.</p>
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
