"use client";

import { useCallback, useEffect, useState } from "react";

interface Teacher {
  id: string;
  username: string;
  fullName: string;
  email: string;
  isFirstLogin: boolean;
  workspaceCount: number;
  conductedDays: number;
  workspaces: { id: string; name: string; status: string }[];
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", fullName: "", email: "" });
  const [created, setCreated] = useState<{ fullName: string; temporaryPassword: string } | null>(null);

  const fetchTeachers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/admin/users/teachers");
      if (res.ok) setTeachers((await res.json()).teachers || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const createTeacher = async () => {
    const res = await fetch("/api/v1/admin/users/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setCreated({ fullName: data.teacher.fullName, temporaryPassword: data.temporaryPassword });
      setForm({ username: "", fullName: "", email: "" });
      fetchTeachers();
    } else {
      setMessage({ type: "error", text: data.message || "Failed to create teacher." });
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Manage Teachers</h1>
          <p className="text-text-secondary text-sm mt-1">
            Teacher accounts, workspace assignments and workload metrics.
          </p>
        </div>
        <button
          onClick={() => {
            setCreated(null);
            setIsCreateOpen(true);
          }}
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-brand-500/20"
        >
          + New Teacher
        </button>
      </div>

      {message && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm border bg-rose-500/10 border-rose-500/25 text-rose-400">
          {message.text}
        </div>
      )}

      {isLoading ? (
        <div className="text-text-secondary py-20 text-center">Loading…</div>
      ) : (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary text-xs font-mono text-left">
                <th className="py-2 pr-4">Teacher</th>
                <th className="py-2 px-2">Workspaces</th>
                <th className="py-2 px-2">Conducted Days</th>
                <th className="py-2 px-2">Assignments</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t border-border-strong align-top">
                  <td className="py-3 pr-4">
                    <p className="text-white">{t.fullName}</p>
                    <p className="text-text-tertiary text-xs font-mono">
                      {t.username} · {t.email}
                    </p>
                  </td>
                  <td className="py-3 px-2 text-text-secondary">{t.workspaceCount}</td>
                  <td className="py-3 px-2 text-text-secondary">{t.conductedDays}</td>
                  <td className="py-3 px-2">
                    <div className="flex flex-wrap gap-1.5">
                      {t.workspaces.map((w) => (
                        <span
                          key={w.id}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            w.status === "ACTIVE"
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                              : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
                          }`}
                        >
                          {w.name}
                        </span>
                      ))}
                      {t.workspaces.length === 0 && (
                        <span className="text-text-tertiary text-xs">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {teachers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-text-secondary">
                    No teachers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            {created ? (
              <>
                <h2 className="text-lg font-semibold text-white mb-3">Teacher Created</h2>
                <p className="text-text-secondary text-sm mb-4">
                  Share this temporary password with <span className="text-white">{created.fullName}</span>.
                  They must change it on first login.
                </p>
                <div className="bg-bg-base border border-border-strong rounded-xl px-4 py-3 font-mono text-emerald-400 text-center text-lg select-all">
                  {created.temporaryPassword}
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">New Teacher</h2>
                <div className="space-y-4">
                  {(["username", "fullName", "email"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-text-secondary mb-1.5 capitalize">
                        {field === "fullName" ? "Full Name" : field} *
                      </label>
                      <input
                        value={form[field]}
                        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                        className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTeacher}
                    disabled={!form.username || !form.fullName || !form.email}
                    className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
                  >
                    Create
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
