"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database, Tables, TablesInsert } from "@/database.types";

type Role = Database["public"]["Enums"]["role_type"];
type TaskStatus = Database["public"]["Enums"]["task_status"];

type Profile = Tables<"profiles">;
type TaskRow = Tables<"tasks">;

type TaskDraft = {
  title: string;
  description?: string;
  dueDate: string;
  status: TaskStatus;
  notes?: string;
};

function formatDateForDisplay(isoDate: string): string {
  try {
    const coerced = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(coerced.getTime())) return isoDate;
    return coerced.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function isOverdue(task: TaskRow): boolean {
  const today = new Date();
  const date = new Date(`${task.due_date}T23:59:59`);
  return task.status !== "done" && date.getTime() < today.getTime();
}

function isDueSoon(task: TaskRow): boolean {
  const today = new Date();
  const due = new Date(`${task.due_date}T23:59:59`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return task.status !== "done" && diffDays >= 0 && diffDays <= 1;
}

export default function TasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);

  const [people, setPeople] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [sharedTaskIds, setSharedTaskIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<"all" | TaskStatus | "overdue" | "due_soon">("all");

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shareOpenFor, setShareOpenFor] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draft, setDraft] = useState<TaskDraft>({
    title: "",
    description: "",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "todo",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string>("");

  // Nudges config
  const [configuringNudges, setConfiguringNudges] = useState(false);
  const [nudgeTimes, setNudgeTimes] = useState<string[]>(["09:00", "13:00", "17:00"]);
  const [nudgeTZ, setNudgeTZ] = useState<string>("UTC");
  const [nudgeEnabled, setNudgeEnabled] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const uid = data.user?.id ?? null;
      setSessionUserId(uid);
      if (uid) {
        bootstrap(uid).catch(() => {
          // ignore
        });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      const uid = sess?.user?.id ?? null;
      setSessionUserId(uid);
      if (uid) {
        await bootstrap(uid);
      } else {
        setTasks([]);
        setPeople([]);
        setMyProfile(null);
      }
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (sessionUserId) {
      supabase
        .from("nudge_configs")
        .select("*")
        .eq("user_id", sessionUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setNudgeTimes(data.times ?? ["09:00", "13:00", "17:00"]);
            setNudgeTZ(data.timezone ?? "UTC");
            setNudgeEnabled(Boolean(data.enabled));
          } else {
            setNudgeTimes(["09:00", "13:00", "17:00"]);
            setNudgeTZ("UTC");
            setNudgeEnabled(true);
          }
        });
    }
  }, [sessionUserId, supabase]);

  async function bootstrap(uid: string) {
    await Promise.all([fetchMyProfile(uid), fetchPeople(), fetchTasks(uid)]);
  }

  async function fetchMyProfile(uid: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setMyProfile(data);
  }

  async function fetchPeople() {
    const { data } = await supabase.from("profiles").select("id,name,email,role").order("name", { ascending: true });
    if (data) setPeople(data);
  }

  async function fetchTasks(uid: string) {
    const myTasksPromise = supabase
      .from("tasks")
      .select("*")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false });

    const { data: shareRows } = await supabase.from("task_shares").select("task_id").eq("user_id", uid);
    const sharedIds = new Set<string>((shareRows ?? []).map((r) => r.task_id));
    setSharedTaskIds(sharedIds);

    let merged: TaskRow[] = [];
    const [{ data: myData }] = await Promise.all([myTasksPromise]);

    if (myData) merged = myData;

    if (sharedIds.size > 0) {
      const { data: sharedData } = await supabase
        .from("tasks")
        .select("*")
        .in("id", [...sharedIds])
        .order("created_at", { ascending: false });
      if (sharedData) {
        const map = new Map<string, TaskRow>();
        [...merged, ...sharedData].forEach((t) => map.set(t.id, t));
        merged = [...map.values()].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    }
    setTasks(merged);
  }

  function validateDraft(): boolean {
    const errs: Record<string, string> = {};
    if (!draft.title.trim()) errs.title = "Title is required.";
    if (!draft.dueDate) errs.dueDate = "Due date is required.";
    if (draft.title.length > 120) errs.title = "Title should be under 120 characters.";
    if ((draft.description ?? "").length > 2000) errs.description = "Description is too long.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function openCreateForm() {
    setDraft({
      title: "",
      description: "",
      dueDate: new Date().toISOString().slice(0, 10),
      status: "todo",
      notes: "",
    });
    setEditingId(null);
    setFormErrors({});
    setFormOpen(true);
  }

  function openEditForm(task: TaskRow) {
    if (task.owner_id !== sessionUserId) return;
    setDraft({
      title: task.title,
      description: task.description ?? "",
      dueDate: task.due_date,
      status: task.status,
      notes: task.notes ?? "",
    });
    setEditingId(task.id);
    setFormOpen(true);
    setFormErrors({});
  }

  async function saveDraft() {
    if (!sessionUserId) return;
    if (!validateDraft()) return;

    if (editingId) {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          title: draft.title.trim(),
          description: (draft.description ?? "").trim(),
          due_date: draft.dueDate,
          status: draft.status,
          notes: (draft.notes ?? "").trim(),
        })
        .eq("id", editingId)
        .select("*")
        .maybeSingle();

      if (error) {
        setToast(error.message);
        return;
      }
      if (data) {
        setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
        setToast("Task updated.");
      }
    } else {
      const insert = {
        title: draft.title.trim(),
        description: (draft.description ?? "").trim(),
        due_date: draft.dueDate,
        status: draft.status,
        notes: (draft.notes ?? "").trim(),
        owner_id: sessionUserId,
      } as TablesInsert<"tasks">;

      const { data, error } = await supabase.from("tasks").insert(insert).select("*").single();
      if (error) {
        setToast(error.message);
        return;
      }
      if (data) {
        setTasks((prev) => [data, ...prev]);
        setToast("Task created.");
      }
    }

    setFormOpen(false);
    setEditingId(null);
  }

  async function toggleDone(task: TaskRow) {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: nextStatus })
      .eq("id", task.id)
      .select("*")
      .maybeSingle();

    if (error) {
      setToast(error.message);
      return;
    }
    if (data) {
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
    }
  }

  async function deleteTask(taskId: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setToast(error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setConfirmDeleteId(null);
    setToast("Task deleted.");
  }

  async function updateSharing(taskId: string, nextSharedWith: string[]) {
    if (!sessionUserId) return;
    const { data: current } = await supabase.from("task_shares").select("user_id").eq("task_id", taskId);
    const currentSet = new Set((current ?? []).map((r) => r.user_id));
    const nextSet = new Set(nextSharedWith);
    const toRemove = [...currentSet].filter((x) => !nextSet.has(x));
    const toAdd = [...nextSet].filter((x) => !currentSet.has(x));

    if (toRemove.length > 0) {
      const { error } = await supabase.from("task_shares").delete().eq("task_id", taskId).in("user_id", toRemove);
      if (error) {
        setToast(error.message);
        return;
      }
    }
    if (toAdd.length > 0) {
      const rows = toAdd.map((user_id) => ({ task_id: taskId, user_id }));
      const { error } = await supabase.from("task_shares").insert(rows);
      if (error) {
        setToast(error.message);
        return;
      }
    }

    await fetchTasks(sessionUserId);
    setToast("Sharing updated.");
  }

  async function saveNudgeConfig() {
    if (!sessionUserId) return;
    const payload = {
      user_id: sessionUserId,
      times: nudgeTimes,
      timezone: nudgeTZ,
      enabled: nudgeEnabled,
    } as TablesInsert<"nudge_configs">;

    const { error } = await supabase.from("nudge_configs").upsert(payload).eq("user_id", sessionUserId);
    if (error) {
      setToast(error.message);
      return;
    }
    setToast("Nudge settings saved.");
    setConfiguringNudges(false);
  }

  const filteredTasks = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matches =
        !s ||
        t.title.toLowerCase().includes(s) ||
        (t.description ?? "").toLowerCase().includes(s);
      const filterMatch =
        filter === "all"
          ? true
          : filter === "overdue"
          ? isOverdue(t)
          : filter === "due_soon"
          ? isDueSoon(t)
          : t.status === filter;
      return matches && filterMatch;
    });
  }, [tasks, search, filter]);

  function personById(id: string): Profile | undefined {
    return people.find((p) => p.id === id);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center">
              <span className="text-xl">⚡</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">FlowTrack</h1>
              <p className="text-xs text-white/60">Focus. Share. Deliver.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-white/80">
            {myProfile && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-white/70 text-sm">
                  {myProfile.name || myProfile.email} • {myProfile.role === "manager" ? "Manager" : "User"}
                </span>
              </div>
            )}
            <Link
              href="/nudges"
              className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 hover:bg-white/15 transition text-sm"
            >
              Nudges
            </Link>
            <Link
              href="/reports"
              className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 hover:bg-white/15 transition text-sm"
            >
              Reports
            </Link>
            <button
              type="button"
              onClick={() => setConfiguringNudges(true)}
              className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 hover:bg-white/15 transition text-sm"
            >
              Nudge settings
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 hover:bg-white/15 transition text-sm"
            >
              Sign out
            </button>
          </div>
        </header>

        <TaskBoard
          me={myProfile}
          people={people}
          tasks={filteredTasks}
          allTasks={tasks}
          sharedTaskIds={sharedTaskIds}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          onNew={openCreateForm}
          onEdit={openEditForm}
          onToggleDone={toggleDone}
          onShare={(taskId) => setShareOpenFor(taskId)}
          onDelete={(taskId) => setConfirmDeleteId(taskId)}
        />

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/30 px-4 py-3 text-sm">
            {toast}
            <button
              type="button"
              className="ml-3 text-emerald-300 underline underline-offset-4"
              onClick={() => setToast("")}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create/Edit Form Modal */}
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setFormOpen(false)}
            />
            <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6">
              <h3 className="text-lg font-semibold">
                {editingId ? "Edit task" : "Create a task"}
              </h3>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium">Title</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Write a clear task title"
                    className={`mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 transition placeholder:text-white/40 ${
                      formErrors.title ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                    }`}
                  />
                  {formErrors.title && <p className="mt-2 text-xs text-rose-300">{formErrors.title}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium">Description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Details, context, or links..."
                    className={`mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 transition placeholder:text-white/40 min-h-[100px] ${
                      formErrors.description ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                    }`}
                  />
                  {formErrors.description && <p className="mt-2 text-xs text-rose-300">{formErrors.description}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium">Due date</label>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                      className={`mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 transition ${
                        formErrors.dueDate ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                      }`}
                    />
                    {formErrors.dueDate && <p className="mt-2 text-xs text-rose-300">{formErrors.dueDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Status</label>
                    <select
                      value={draft.status}
                      onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TaskStatus }))}
                      className="mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30"
                    >
                      <option value="todo">Todo</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">Notes</label>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="Personal notes, decisions, or blockers..."
                    className="mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30 min-h-[80px]"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  className="rounded-xl px-4 py-2 text-sm bg-white text-slate-900 font-medium shadow hover:shadow-md transition"
                >
                  {editingId ? "Save changes" : "Create task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share Modal */}
        {shareOpenFor && (
          <ShareModal
            task={tasks.find((t) => t.id === shareOpenFor)!}
            ownerId={tasks.find((t) => t.id === shareOpenFor)!.owner_id}
            meId={sessionUserId ?? ""}
            people={people}
            onClose={() => setShareOpenFor(null)}
            onSave={(next) => updateSharing(shareOpenFor, next)}
          />
        )}

        {/* Delete Confirmation */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setConfirmDeleteId(null)}
            />
            <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6">
              <h3 className="text-lg font-semibold">Delete task?</h3>
              <p className="mt-2 text-sm text-white/70">This action cannot be undone.</p>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-xl px-4 py-2 text-sm bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(confirmDeleteId)}
                  className="rounded-xl px-4 py-2 text-sm bg-rose-500/80 text-white font-medium shadow hover:bg-rose-500 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nudge settings modal */}
        {configuringNudges && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setConfiguringNudges(false)}
            />
            <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6">
              <h3 className="text-lg font-semibold">Nudge settings</h3>
              <p className="mt-1 text-sm text-white/70">Choose up to three times per day you want a reminder email.</p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium">Enabled</label>
                  <div className="mt-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={nudgeEnabled}
                        onChange={(e) => setNudgeEnabled(e.target.checked)}
                      />
                      Enable daily nudges
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">Times (local)</label>
                  <p className="text-xs text-white/60 mt-1">Enter up to 3 times in 24h format (HH:MM).</p>
                  <div className="mt-2 space-y-2">
                    {[0, 1, 2].map((idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={nudgeTimes[idx] ?? ""}
                        onChange={(e) => {
                          const next = [...nudgeTimes];
                          next[idx] = e.target.value;
                          setNudgeTimes(next.filter(Boolean));
                        }}
                        placeholder={idx === 0 ? "09:00" : idx === 1 ? "13:00" : "17:00"}
                        className="w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30 placeholder:text-white/40"
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">Timezone (IANA)</label>
                  <input
                    type="text"
                    value={nudgeTZ}
                    onChange={(e) => setNudgeTZ(e.target.value)}
                    placeholder="e.g., America/New_York"
                    className="mt-2 w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30 placeholder:text-white/40"
                  />
                  <p className="text-xs text-white/60 mt-1">We’ll schedule using this timezone.</p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfiguringNudges(false)}
                  className="rounded-xl px-4 py-2 text-sm bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNudgeConfig}
                  className="rounded-xl px-4 py-2 text-sm bg-white text-slate-900 font-medium shadow hover:shadow-md transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type TaskBoardProps = {
  me: Profile | null;
  people: Profile[];
  tasks: TaskRow[];
  allTasks: TaskRow[];
  sharedTaskIds: Set<string>;
  search: string;
  setSearch: (s: string) => void;
  filter: "all" | TaskStatus | "overdue" | "due_soon";
  setFilter: (f: "all" | TaskStatus | "overdue" | "due_soon") => void;
  onNew: () => void;
  onEdit: (t: TaskRow) => void;
  onToggleDone: (t: TaskRow) => void;
  onShare: (taskId: string) => void;
  onDelete: (taskId: string) => void;
};

function TaskBoard({
  me,
  people,
  tasks,
  sharedTaskIds,
  search,
  setSearch,
  filter,
  setFilter,
  onNew,
  onEdit,
  onToggleDone,
  onShare,
  onDelete,
}: TaskBoardProps) {
  function personById(id: string): Profile | undefined {
    return people.find((p) => p.id === id);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNew}
            className="rounded-xl bg-white text-slate-900 font-medium px-4 py-2 shadow hover:shadow-md transition"
          >
            + New Task
          </button>
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30 placeholder:text-white/40"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
              ⌕
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | TaskStatus | "overdue" | "due_soon")}
            className="rounded-xl bg-white/5 px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30"
          >
            <option value="all">All</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due soon</option>
          </select>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((t) => {
          const ownerName = me && t.owner_id === me.id ? "You" : personById(t.owner_id)?.name ?? "Unknown";
          const isOwner = me?.id === t.owner_id;
          const isSharedWithMe = sharedTaskIds.has(t.id);

          return (
            <div key={t.id} className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm text-white/70 line-clamp-2">{t.description || "No description"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    t.status === "done"
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                      : t.status === "in_progress"
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30"
                      : "bg-white/10 text-white ring-1 ring-white/20"
                  }`}
                >
                  {t.status === "done" ? "Done" : t.status === "in_progress" ? "In Progress" : "Todo"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <div className="rounded-lg bg-white/5 px-2 py-1 ring-1 ring-white/10">Due {formatDateForDisplay(t.due_date)}</div>
                {isOverdue(t) && (
                  <div className="rounded-lg bg-rose-500/20 px-2 py-1 ring-1 ring-rose-400/30 text-rose-200">Overdue</div>
                )}
                {isDueSoon(t) && !isOverdue(t) && (
                  <div className="rounded-lg bg-amber-500/20 px-2 py-1 ring-1 ring-amber-400/30 text-amber-200">Due soon</div>
                )}
                <div className="rounded-lg bg-white/5 px-2 py-1 ring-1 ring-white/10">Owner: {ownerName}</div>
                {isSharedWithMe && (
                  <div className="rounded-lg bg-white/5 px-2 py-1 ring-1 ring-white/10">Shared with you</div>
                )}
              </div>

              {t.notes && (
                <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <p className="text-xs text-white/70">Notes</p>
                  <p className="text-sm mt-1">{t.notes}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onToggleDone(t)}
                  className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${
                    t.status === "done"
                      ? "bg-white text-slate-900 ring-white/20"
                      : "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30 hover:bg-emerald-500/25"
                  }`}
                >
                  {t.status === "done" ? "Mark as Todo" : "Mark as Done"}
                </button>
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={() => onEdit(t)}
                  className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${
                    isOwner
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30 hover:bg-sky-500/25"
                      : "bg-white/10 text-white ring-1 ring-white/20 opacity-60 cursor-not-allowed"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={() => onShare(t.id)}
                  className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${
                    isOwner
                      ? "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"
                      : "bg-white/10 text-white ring-1 ring-white/20 opacity-60 cursor-not-allowed"
                  }`}
                >
                  Share
                </button>
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={() => onDelete(t.id)}
                  className={`rounded-xl px-3 py-2 text-sm transition ${
                    isOwner
                      ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25"
                      : "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30 opacity-60 cursor-not-allowed"
                  }`}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <div className="mt-10 rounded-2xl bg-white/5 ring-1 ring-white/10 p-8 text-center">
          <p className="text-white/80">No tasks match your filters.</p>
          <button
            type="button"
            onClick={onNew}
            className="mt-4 rounded-xl bg-white text-slate-900 font-medium px-4 py-2 shadow hover:shadow-md transition"
          >
            Create your first task
          </button>
        </div>
      )}
    </div>
  );
}

type ShareModalProps = {
  task: TaskRow;
  ownerId: string;
  meId: string;
  people: Profile[];
  onClose: () => void;
  onSave: (nextSharedWith: string[]) => void;
};

function ShareModal({ task, ownerId, meId, people, onClose, onSave }: ShareModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState<string>("");

  const isOwner = ownerId === meId;

  useEffect(() => {
    let mounted = true;
    supabase
      .from("task_shares")
      .select("user_id")
      .eq("task_id", task.id)
      .then(({ data }) => {
        if (!mounted) return;
        setSelected((data ?? []).map((r) => r.user_id));
      });
    return () => {
      mounted = false;
    };
  }, [supabase, task.id]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        p.id !== ownerId &&
        (!q ||
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q))
    );
  }, [people, query, ownerId]);

  function togglePerson(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function revokeAll() {
    setSelected([]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6">
        <h3 className="text-lg font-semibold">Share "{task.title}"</h3>
        <p className="mt-1 text-sm text-white/70">Collaborators can view and update status and notes.</p>

        {!isOwner && (
          <div className="mt-3 rounded-lg bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/30 px-3 py-2 text-xs">
            Only the owner can change sharing.
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search people..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 rounded-xl bg-white/5 px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-white/30 placeholder:text-white/40"
              disabled={!isOwner}
            />
            <button
              type="button"
              onClick={revokeAll}
              disabled={!isOwner}
              className={`rounded-xl px-3 py-2 text-sm ${
                isOwner
                  ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25 transition"
                  : "bg-white/10 text-white ring-1 ring-white/20 opacity-60 cursor-not-allowed"
              }`}
            >
              Revoke all
            </button>
          </div>

          <div className="mt-4 max-h-56 overflow-auto rounded-xl ring-1 ring-white/10">
            {filteredPeople.length === 0 ? (
              <div className="p-4 text-sm text-white/70">No matches.</div>
            ) : (
              <ul className="divide-y divide-white/5">
                {filteredPeople.map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-white/60">
                        {p.email} • {p.role === "manager" ? "Manager" : "User"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => isOwner && togglePerson(p.id)}
                      className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                        selected.includes(p.id)
                          ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30"
                          : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"
                      } ${!isOwner ? "opacity-60 cursor-not-allowed" : ""}`}
                      disabled={!isOwner}
                    >
                      {selected.includes(p.id) ? "Added" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-xs text-white/60">Sharing is limited to existing users.</p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isOwner) {
                onClose();
                return;
              }
              onSave(selected);
              onClose();
            }}
            className={`rounded-xl px-4 py-2 text-sm bg-white text-slate-900 font-medium shadow hover:shadow-md transition ${
              !isOwner ? "opacity-60 cursor-not-allowed" : ""
            }`}
            disabled={!isOwner}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
