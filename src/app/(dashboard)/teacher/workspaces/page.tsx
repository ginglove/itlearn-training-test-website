"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DateTimePicker from "@/app/components/DateTimePicker";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalDays: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  memberCount: number;
  dayCount: number;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    totalDays: "",
    startDate: "",
    endDate: "",
  });

  const fetchWorkspaces = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/teacher/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      } else {
        setMessage({ type: "error", text: "Failed to fetch workspaces." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to connect to the server." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/v1/teacher/workspaces", {
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
        setMessage({ type: "success", text: "Workspace created." });
        fetchWorkspaces();
      } else {
        setMessage({ type: "error", text: data.message || "Failed to create workspace." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to connect to the server." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Workspaces</h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage your classes: members, timetable, roll call, activities and reports.
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

      {isLoading ? (
        <div className="text-text-secondary py-20 text-center">Loading workspaces…</div>
      ) : workspaces.length === 0 ? (
        <div className="border border-dashed border-border-strong rounded-2xl py-20 text-center text-text-secondary">
          No workspaces yet. Create your first class workspace.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => router.push(`/teacher/workspaces/${ws.id}`)}
              className="text-left bg-bg-surface border border-border-strong rounded-2xl p-5 hover:border-brand-500/40 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-white truncate">{ws.name}</h2>
                <span
                  className={`shrink-0 text-[10px] font-mono px-2 py-1 rounded-full border ${
                    ws.status === "ACTIVE"
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                      : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
                  }`}
                >
                  {ws.status}
                </span>
              </div>
              {ws.description && (
                <p className="text-text-secondary text-sm mt-1.5 line-clamp-2">{ws.description}</p>
              )}
              <div className="flex gap-5 mt-4 text-xs text-text-tertiary font-mono">
                <span>{ws.memberCount} students</span>
                <span>
                  {ws.dayCount}/{ws.totalDays || "?"} days
                </span>
                {ws.startDate && <span>from {ws.startDate}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

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
                  placeholder="e.g. Java Backend K12"
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
                onClick={handleCreate}
                disabled={isSaving || !form.name.trim()}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                {isSaving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
