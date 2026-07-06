"use client";

import { useEffect, useState } from "react";

interface WorkspaceOption {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
}

/**
 * Add/remove one student across workspaces. Uses the role-scoped teacher API,
 * so teachers see their assigned workspaces and admins see all of them.
 */
export default function StudentWorkspacesModal({
  student,
  onClose,
  onSaved,
}: {
  student: { id: string; fullName: string };
  onClose: () => void;
  onSaved: (summary: { added: number; removed: number; blocked: string[] }) => void;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/teacher/workspaces").then((r) => (r.ok ? r.json() : { workspaces: [] })),
      fetch(`/api/v1/teacher/students/${student.id}/workspaces`).then((r) =>
        r.ok ? r.json() : { workspaceIds: [] }
      ),
    ])
      .then(([wsData, memberData]) => {
        setWorkspaces(
          (wsData.workspaces || []).map((w: any) => ({ id: w.id, name: w.name, status: w.status }))
        );
        const ids = new Set<string>(memberData.workspaceIds || []);
        setMemberOf(ids);
        setChecked(new Set(ids));
      })
      .finally(() => setIsLoading(false));
  }, [student.id]);

  const toggle = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const toAdd = [...checked].filter((id) => !memberOf.has(id));
      const toRemove = [...memberOf].filter((id) => !checked.has(id));
      const blocked: string[] = [];
      let added = 0;
      let removed = 0;

      for (const wsId of toAdd) {
        const res = await fetch(`/api/v1/teacher/workspaces/${wsId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds: [student.id] }),
        });
        if (res.ok) added++;
        else {
          const data = await res.json().catch(() => null);
          blocked.push(data?.message || "Failed to add to a workspace");
        }
      }
      for (const wsId of toRemove) {
        const res = await fetch(`/api/v1/teacher/workspaces/${wsId}/members/${student.id}`, {
          method: "DELETE",
        });
        if (res.ok) removed++;
        else {
          const data = await res.json().catch(() => null);
          blocked.push(data?.message || "Failed to remove from a workspace");
        }
      }
      onSaved({ added, removed, blocked });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-semibold text-white mb-1">Workspaces — {student.fullName}</h2>
        <p className="text-text-secondary text-xs mb-4">
          Tick to enroll, untick to remove. Removal is blocked for workspaces where the student
          already has submissions.
        </p>
        <div className="overflow-y-auto flex-grow divide-y divide-border-strong">
          {isLoading ? (
            <p className="text-text-secondary text-sm py-8 text-center">Loading…</p>
          ) : workspaces.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No workspaces available.</p>
          ) : (
            workspaces.map((w) => (
              <label
                key={w.id}
                className={`flex items-center gap-3 py-2.5 ${
                  w.status === "ARCHIVED" ? "opacity-50" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  disabled={w.status === "ARCHIVED"}
                  checked={checked.has(w.id)}
                  onChange={(e) => toggle(w.id, e.target.checked)}
                  className="accent-brand-500"
                />
                <span className="text-white text-sm flex-grow truncate">{w.name}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    w.status === "ACTIVE"
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                      : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
                  }`}
                >
                  {w.status}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={isSaving || isLoading}
            className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
