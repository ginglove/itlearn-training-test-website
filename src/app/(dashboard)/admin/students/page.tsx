"use client";

import { useCallback, useEffect, useState } from "react";
import StudentWorkspacesModal from "@/app/components/StudentWorkspacesModal";
import UserImportExport from "@/app/components/UserImportExport";

interface Student {
  id: string;
  username: string;
  fullName: string;
  email: string;
  isFirstLogin: boolean;
  isActive: boolean;
  activeWorkspaces: number;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [workspacesFor, setWorkspacesFor] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "" });
  const [resetResult, setResetResult] = useState<{ fullName: string; temporaryPassword: string } | null>(null);
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

  const saveEdit = async () => {
    if (!editStudent) return;
    const res = await fetch(`/api/v1/admin/users/students/${editStudent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (res.ok) {
      setEditStudent(null);
      fetchStudents();
    } else {
      setMessage(data.message || "Failed to update student.");
    }
  };

  const toggleActive = async (st: Student) => {
    const verb = st.isActive ? "Deactivate" : "Activate";
    if (!confirm(`${verb} ${st.fullName}? ${st.isActive ? "They will no longer be able to log in." : "They will be able to log in again."}`)) return;
    const res = await fetch(`/api/v1/admin/users/students/${st.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !st.isActive }),
    });
    const data = await res.json();
    if (res.ok) fetchStudents();
    else setMessage(data.message || "Failed to update account status.");
  };

  const resetPassword = async (st: Student) => {
    if (!confirm(`Issue a new temporary password for ${st.fullName}? Their current password stops working.`)) return;
    const res = await fetch(`/api/v1/admin/users/students/${st.id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setResetResult({ fullName: st.fullName, temporaryPassword: data.temporaryPassword });
      fetchStudents();
    } else {
      setMessage(data.message || "Failed to reset password.");
    }
  };

  const deleteStudent = async (st: Student) => {
    if (!confirm(`Delete student account "${st.fullName}"? Blocked if they have exam submissions.`)) return;
    const res = await fetch(`/api/v1/admin/users/students/${st.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) fetchStudents();
    else setMessage(data.message || "Failed to delete student.");
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
        <div className="flex gap-2 flex-wrap">
          <UserImportExport role="STUDENT" onImported={fetchStudents} />
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
                <th className="py-2 px-2">Status</th>
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
                    {!s.isActive ? (
                      <span className="text-rose-400 text-xs font-mono">DEACTIVATED</span>
                    ) : s.isFirstLogin ? (
                      <span className="text-amber-400 text-xs font-mono">FIRST LOGIN</span>
                    ) : (
                      <span className="text-emerald-400 text-xs font-mono">active</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="flex gap-3 justify-end whitespace-nowrap">
                      <button
                        onClick={() => setWorkspacesFor(s)}
                        className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
                      >
                        Workspaces
                      </button>
                      <button
                        onClick={() => {
                          setEditStudent(s);
                          setEditForm({ fullName: s.fullName, email: s.email });
                        }}
                        className="text-text-secondary hover:text-white text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => resetPassword(s)}
                        className="text-amber-400 hover:text-amber-300 text-xs transition-colors"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => toggleActive(s)}
                        className={`text-xs transition-colors ${
                          s.isActive
                            ? "text-orange-400 hover:text-orange-300"
                            : "text-emerald-400 hover:text-emerald-300"
                        }`}
                      >
                        {s.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteStudent(s)}
                        className="text-rose-400 hover:text-rose-300 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </div>
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

      {editStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">
              Edit Student — {editStudent.username}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Full Name *</label>
                <input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Email *</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditStudent(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!editForm.fullName.trim() || !editForm.email.trim()}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {resetResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-3">Password Reset</h2>
            <p className="text-text-secondary text-sm mb-4">
              Share this temporary password with{" "}
              <span className="text-white">{resetResult.fullName}</span>. They must change it on
              next login.
            </p>
            <div className="bg-bg-base border border-border-strong rounded-xl px-4 py-3 font-mono text-emerald-400 text-center text-lg select-all">
              {resetResult.temporaryPassword}
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setResetResult(null)}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
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
