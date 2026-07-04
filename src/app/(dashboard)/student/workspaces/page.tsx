"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalDays: number;
  startDate: string | null;
  endDate: string | null;
}

export default function StudentWorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/student/workspaces")
      .then((res) => (res.ok ? res.json() : { workspaces: [] }))
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-white mb-1">My Workspaces</h1>
      <p className="text-text-secondary text-sm mb-8">
        Classes you are enrolled in, with activities, timetable and attendance.
      </p>

      {isLoading ? (
        <div className="text-text-secondary py-20 text-center">Loading…</div>
      ) : workspaces.length === 0 ? (
        <div className="border border-dashed border-border-strong rounded-2xl py-20 text-center text-text-secondary">
          You are not enrolled in any workspace yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => router.push(`/student/workspaces/${ws.id}`)}
              className="text-left bg-bg-surface border border-border-strong rounded-2xl p-5 hover:border-brand-500/40 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-white truncate">{ws.name}</h2>
                {/* W10: green for ACTIVE, grey for ARCHIVED */}
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
              <p className="text-text-tertiary text-xs font-mono mt-3">
                {ws.totalDays} planned days
                {ws.startDate ? ` · ${ws.startDate} → ${ws.endDate || "?"}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
