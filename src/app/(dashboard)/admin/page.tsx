"use client";

import { useCallback, useEffect, useState } from "react";
import DateTimePicker from "@/app/components/DateTimePicker";

interface AdminWorkspace {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalDays: number;
  startDate: string | null;
  endDate: string | null;
  memberCount: number;
  teachers: { teacherId: string; fullName: string }[];
}
interface TeacherOption {
  id: string;
  fullName: string;
  username: string;
}

interface DashboardStats {
  totalActiveStudents: number;
  totalActiveTeachers: number;
  totalActiveWorkspaces: number;
  totalExams: number;
  totalQuestions: number;
}

export default function AdminWorkspacesPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", totalDays: "", startDate: "", endDate: "" });

  const [assignFor, setAssignFor] = useState<AdminWorkspace | null>(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wsRes, tRes, statsRes] = await Promise.all([
        fetch("/api/v1/admin/workspaces"),
        fetch("/api/v1/admin/users/teachers"),
        fetch("/api/v1/admin/dashboard/stats"),
      ]);
      if (wsRes.ok) setWorkspaces((await wsRes.json()).workspaces || []);
      if (tRes.ok) setTeachers((await tRes.json()).teachers || []);
      if (statsRes.ok) setStats((await statsRes.json()).stats || null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createWorkspace = async () => {
    const res = await fetch("/api/v1/admin/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        totalDays: form.totalDays ? parseInt(form.totalDays) : 0,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setIsCreateOpen(false);
      setForm({ name: "", description: "", totalDays: "", startDate: "", endDate: "" });
      notify("success", "Workspace created.");
      fetchAll();
    } else {
      notify("error", data.message || "Failed to create workspace.");
    }
  };

  const deleteWorkspace = async (ws: AdminWorkspace) => {
    if (!confirm(`Delete workspace "${ws.name}"? Only empty workspaces can be deleted.`)) return;
    const res = await fetch(`/api/v1/admin/workspaces/${ws.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Workspace deleted.");
      fetchAll();
    } else {
      notify("error", data.message || "Failed to delete workspace.");
    }
  };

  const unarchive = async (ws: AdminWorkspace) => {
    if (!confirm(`Un-archive "${ws.name}"? It becomes editable again.`)) return;
    const res = await fetch(`/api/v1/admin/workspaces/${ws.id}/unarchive`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Workspace restored to ACTIVE.");
      fetchAll();
    } else {
      notify("error", data.message || "Failed to un-archive.");
    }
  };

  const assignTeacher = async () => {
    if (!assignFor || !assignTeacherId) return;
    const res = await fetch(`/api/v1/admin/workspaces/${assignFor.id}/teachers/${assignTeacherId}`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Teacher assigned.");
      setAssignFor(null);
      fetchAll();
    } else {
      notify("error", data.message || "Failed to assign teacher.");
    }
  };

  const removeTeacher = async (wsId: string, teacherId: string) => {
    const res = await fetch(`/api/v1/admin/workspaces/${wsId}/teachers/${teacherId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Teacher assignment removed.");
      fetchAll();
    } else {
      notify("error", data.message || "Failed to remove assignment.");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Workspace Governance</h1>
          <p className="text-text-secondary text-sm mt-1">
            System-wide workspaces: create, assign teachers, archive overrides.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-brand-500/20"
        >
          + New Workspace
        </button>
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl text-sm border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/25 text-rose-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Global dashboard metrics (RSD v9.1 §4.1) */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: "Active Students", value: stats.totalActiveStudents },
            { label: "Active Teachers", value: stats.totalActiveTeachers },
            { label: "Active Workspaces", value: stats.totalActiveWorkspaces },
            { label: "Total Exams", value: stats.totalExams },
            { label: "Total Questions", value: stats.totalQuestions },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-bg-surface border border-border-strong rounded-2xl p-4 text-center"
            >
              <p className="text-2xl font-bold text-white font-mono">{c.value}</p>
              <p className="text-text-tertiary text-xs mt-1 uppercase tracking-wider">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-text-secondary py-20 text-center">Loading…</div>
      ) : (
        <div className="space-y-4">
          {workspaces.map((ws) => (
            <div key={ws.id} className="bg-bg-surface border border-border-strong rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-white">{ws.name}</h2>
                    <span
                      className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
                        ws.status === "ACTIVE"
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                          : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
                      }`}
                    >
                      {ws.status}
                    </span>
                  </div>
                  <p className="text-text-tertiary text-xs font-mono mt-1">
                    {ws.memberCount} students · {ws.totalDays} planned days
                    {ws.startDate ? ` · ${ws.startDate} → ${ws.endDate || "?"}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {ws.teachers.map((t) => (
                      <span
                        key={t.teacherId}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-bg-surface-elevated border border-border-strong text-text-secondary"
                      >
                        {t.fullName}
                        <button
                          onClick={() => removeTeacher(ws.id, t.teacherId)}
                          className="text-rose-400 hover:text-rose-300"
                          title="Remove assignment"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {ws.teachers.length === 0 && (
                      <span className="text-xs text-amber-400">No teacher assigned</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <a
                    href={`/teacher/workspaces/${ws.id}`}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-all"
                  >
                    Manage
                  </a>
                  <button
                    onClick={() => {
                      setAssignFor(ws);
                      setAssignTeacherId("");
                    }}
                    className="px-3 py-1.5 rounded-lg border border-brand-500/30 text-brand-400 hover:bg-brand-500/10 text-xs transition-all"
                  >
                    Assign Teacher
                  </button>
                  {ws.status === "ARCHIVED" && (
                    <button
                      onClick={() => unarchive(ws)}
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs transition-all"
                    >
                      Un-archive
                    </button>
                  )}
                  <button
                    onClick={() => deleteWorkspace(ws)}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {workspaces.length === 0 && (
            <div className="border border-dashed border-border-strong rounded-2xl py-20 text-center text-text-secondary">
              No workspaces exist yet.
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">New Workspace</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Class Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Total Days</label>
                <input
                  type="number"
                  min={0}
                  value={form.totalDays}
                  onChange={(e) => setForm({ ...form, totalDays: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DateTimePicker
                  mode="date"
                  label="Start Date"
                  value={form.startDate}
                  onChange={(val) => setForm({ ...form, startDate: val })}
                />
                <DateTimePicker
                  mode="date"
                  label="End Date"
                  value={form.endDate}
                  onChange={(val) => setForm({ ...form, endDate: val })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWorkspace}
                disabled={!form.name.trim()}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign teacher modal */}
      {assignFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">
              Assign Teacher — {assignFor.name}
            </h2>
            <select
              value={assignTeacherId}
              onChange={(e) => setAssignTeacherId(e.target.value)}
              className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
            >
              <option value="">Select a teacher…</option>
              {teachers
                .filter((t) => !assignFor.teachers.some((a) => a.teacherId === t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.username})
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setAssignFor(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={assignTeacher}
                disabled={!assignTeacherId}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
