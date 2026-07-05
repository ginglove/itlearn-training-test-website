"use client";

import { useCallback, useEffect, useState } from "react";
import StudentWorkspacesModal from "@/app/components/StudentWorkspacesModal";

interface Student {
  id: string;
  username: string;
  fullName: string;
  email: string;
  isFirstLogin: boolean;
  activeWorkspaces: number;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [workspacesFor, setWorkspacesFor] = useState<Student | null>(null);
  const [form, setForm] = useState({ username: "", fullName: "", email: "" });
  const [created, setCreated] = useState<{ fullName: string; temporaryPassword: string } | null>(null);

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/admin/users/students");
      if (res.ok) setStudents((await res.json()).students || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const createStudent = async () => {
    const res = await fetch("/api/v1/admin/users/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setCreated({ fullName: data.student.fullName, temporaryPassword: data.temporaryPassword });
      setForm({ username: "", fullName: "", email: "" });
      fetchStudents();
    } else {
      setMessage(data.message || "Failed to create student.");
    }
  };

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.username.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Manage Students</h1>
          <p className="text-text-secondary text-sm mt-1">
            Global student accounts with enrollment metrics across workspaces.
          </p>
        </div>
        <button
          onClick={() => {
            setCreated(null);
            setIsCreateOpen(true);
          }}
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-brand-500/20"
        >
          + New Student
        </button>
      </div>

      {message && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm border bg-rose-500/10 border-rose-500/25 text-rose-400">
          {message}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, username or email…"
        className="w-full md:w-96 bg-bg-surface border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none mb-5"
      />

      {isLoading ? (
        <div className="text-text-secondary py-20 text-center">Loading…</div>
      ) : (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary text-xs font-mono text-left">
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Active Workspaces</th>
                <th className="py-2 px-2">First Login Pending</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border-strong">
                  <td className="py-3 pr-4">
                    <p className="text-white">{s.fullName}</p>
                    <p className="text-text-tertiary text-xs font-mono">{s.username}</p>
                  </td>
                  <td className="py-3 px-2 text-text-secondary">{s.email}</td>
                  <td className="py-3 px-2 text-text-secondary">{s.activeWorkspaces}</td>
                  <td className="py-3 px-2">
                    {s.isFirstLogin ? (
                      <span className="text-amber-400 text-xs font-mono">YES</span>
                    ) : (
                      <span className="text-text-tertiary text-xs font-mono">no</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <button
                      onClick={() => setWorkspacesFor(s)}
                      className="text-brand-400 hover:text-brand-300 text-xs transition-colors whitespace-nowrap"
                    >
                      Workspaces
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-text-secondary">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {workspacesFor && (
        <StudentWorkspacesModal
          student={workspacesFor}
          onClose={() => setWorkspacesFor(null)}
          onSaved={({ added, removed, blocked }) => {
            setWorkspacesFor(null);
            setMessage(
              blocked.length
                ? `Added ${added}, removed ${removed}. Blocked: ${blocked.join("; ")}`
                : null
            );
            fetchStudents();
          }}
        />
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            {created ? (
              <>
                <h2 className="text-lg font-semibold text-white mb-3">Student Created</h2>
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
                <h2 className="text-lg font-semibold text-white mb-4">New Student</h2>
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
                    onClick={createStudent}
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
