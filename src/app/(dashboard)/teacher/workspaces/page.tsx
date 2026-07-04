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
  createdAt: string;
  memberCount: number;
  dayCount: number;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white">My Workspaces</h1>
        <p className="text-text-secondary text-sm mt-1">
          Classes assigned to you by an administrator: manage members, timetable, roll call,
          activities and reports.
        </p>
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
          No workspaces assigned to you yet. Contact an administrator to be assigned to a class.
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

    </div>
  );
}
