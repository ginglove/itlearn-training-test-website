"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import WorkspaceSwitcher from "@/app/components/WorkspaceSwitcher";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalDays: number;
}
interface Activity {
  id: string;
  examId: string | null;
  activityType: "EXERCISE" | "HOMEWORK" | "ASSESSMENT" | "QUIZ";
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  scorePercentage: number | null;
}
interface TeachingDay {
  id: string;
  dayNumber: number;
  scheduledDate: string;
  topic: string | null;
  notes: string | null;
}
interface AttendanceRow {
  teachingDayId: string;
  dayNumber: number;
  scheduledDate: string;
  topic: string | null;
  status: string | null;
  note: string | null;
}

const TYPE_BADGE: Record<string, string> = {
  EXERCISE: "bg-teal-500/10 border-teal-500/25 text-teal-400",
  HOMEWORK: "bg-purple-500/10 border-purple-500/25 text-purple-400",
  ASSESSMENT: "bg-rose-500/10 border-rose-500/25 text-rose-400",
  QUIZ: "bg-blue-500/10 border-blue-500/25 text-blue-400",
};
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "text-emerald-400",
  IN_PROGRESS: "text-amber-400",
  NOT_STARTED: "text-text-tertiary",
  CANCELLED: "text-rose-400",
  PENDING: "text-amber-400",
};
const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LATE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ABSENT: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  EXCUSED: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

type Tab = "activities" | "timetable" | "attendance" | "report";

// 7.2.3: countdown display for activities with a due date
function formatCountdown(dueDate: string): { text: string; overdue: boolean } {
  const diff = new Date(dueDate).getTime() - Date.now();
  if (diff <= 0) return { text: "overdue", overdue: true };
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return { text: `${days}d ${hours}h left`, overdue: false };
  if (hours > 0) return { text: `${hours}h ${minutes % 60}m left`, overdue: false };
  return { text: `${minutes}m left`, overdue: false };
}

export default function StudentWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [days, setDays] = useState<TeachingDay[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [report, setReport] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("activities");
  const [error, setError] = useState<string | null>(null);
  const [respondTo, setRespondTo] = useState<Activity | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/v1/student/workspaces/${id}`);
    if (res.ok) {
      const data = await res.json();
      setWorkspace(data.workspace);
      setActivities(data.activities || []);
    } else {
      setError("You do not have access to this workspace.");
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (tab === "timetable") {
      fetch(`/api/v1/student/workspaces/${id}/timetable`)
        .then((r) => (r.ok ? r.json() : { teachingDays: [] }))
        .then((d) => setDays(d.teachingDays || []));
    }
    if (tab === "attendance") {
      fetch(`/api/v1/student/workspaces/${id}/attendance`)
        .then((r) => (r.ok ? r.json() : { attendance: [] }))
        .then((d) => setAttendance(d.attendance || []));
    }
    if (tab === "report") {
      fetch(`/api/v1/student/workspaces/${id}/report`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setReport(d?.status === "SUCCESS" ? d : null));
    }
  }, [tab, id]);

  const submitResponse = async () => {
    if (!respondTo || !responseText.trim()) return;
    setIsSubmittingResponse(true);
    try {
      const res = await fetch(
        `/api/v1/student/workspaces/${id}/activities/${respondTo.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textResponse: responseText }),
        }
      );
      if (res.ok) {
        setRespondTo(null);
        setResponseText("");
        fetchDetail();
      }
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  if (error) {
    return <div className="p-10 text-rose-400">{error}</div>;
  }
  if (!workspace) {
    return <div className="p-10 text-text-secondary">Loading workspace…</div>;
  }

  const grouped = ["ASSESSMENT", "QUIZ", "HOMEWORK", "EXERCISE"].map((type) => ({
    type,
    items: activities.filter((a) => a.activityType === type),
  }));

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <button
        onClick={() => router.push("/student/workspaces")}
        className="text-text-secondary hover:text-white text-sm mb-4 transition-colors"
      >
        {"\u2190"} My Workspaces
      </button>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-display font-bold text-white">{workspace.name}</h1>
        <WorkspaceSwitcher
          currentId={id}
          listUrl="/api/v1/student/workspaces"
          basePath="/student/workspaces"
        />
        <span
          className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
            workspace.status === "ACTIVE"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
          }`}
        >
          {workspace.status}
        </span>
      </div>
      {workspace.description && (
        <p className="text-text-secondary text-sm mb-6">{workspace.description}</p>
      )}

      <div className="flex gap-2 flex-wrap mb-6 mt-4">
        {(
          [
            { key: "activities", label: "Activities" },
            { key: "timetable", label: "Timetable" },
            { key: "attendance", label: "My Attendance" },
            { key: "report", label: "My Report" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === t.key
                ? "bg-brand-500/10 border-brand-500/25 text-brand-400"
                : "border-transparent text-text-secondary hover:text-white hover:bg-bg-surface-elevated"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activities" && (
        <div className="space-y-6">

          {grouped.map((g) => (
              <div key={g.type} className="bg-bg-surface border border-border-strong rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-text-secondary mb-3 font-mono">
                  {g.type} ({g.items.length})
                </h2>
                {g.items.length === 0 && (
                  <p className="text-text-tertiary text-xs py-2">No {g.type.toLowerCase()} activities yet.</p>
                )}
                <div className="divide-y divide-border-strong">
                  {g.items.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-mono px-2 py-1 rounded-full border shrink-0 ${TYPE_BADGE[a.activityType]}`}
                        >
                          {a.activityType}
                        </span>
                        <div>
                          <p className="text-white text-sm">{a.title}</p>
                          <p className="text-text-tertiary text-xs">
                            Due: {a.dueDate ? new Date(a.dueDate).toLocaleString() : "—"}
                            {a.dueDate && a.status !== "SUBMITTED" && (() => {
                              const cd = formatCountdown(a.dueDate);
                              return (
                                <span
                                  className={`ml-2 font-mono ${cd.overdue ? "text-rose-400" : "text-amber-400"}`}
                                >
                                  {cd.text}
                                </span>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-xs font-mono ${STATUS_COLORS[a.status] || "text-text-tertiary"}`}>
                          {a.status}
                        </span>
                        <span className="text-xs font-mono text-text-secondary w-14 text-right">
                          {a.scorePercentage !== null ? `${a.scorePercentage}%` : "—"}
                        </span>
                        {!a.examId && workspace.status === "ACTIVE" && (
                          <button
                            onClick={() => {
                              setRespondTo(a);
                              setResponseText("");
                            }}
                            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold transition-all"
                          >
                            {a.status === "SUBMITTED" ? "Resubmit" : "Submit Response"}
                          </button>
                        )}
                        {a.examId &&
                          workspace.status === "ACTIVE" &&
                          ["NOT_STARTED", "IN_PROGRESS", "PENDING"].includes(a.status) && (
                            <button
                              onClick={() => router.push(`/student/exams/${a.examId}`)}
                              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold transition-all"
                            >
                              {a.status === "IN_PROGRESS"
                                ? "Continue"
                                : a.status === "PENDING"
                                  ? "Resume"
                                  : "Start"}
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Standalone activity response modal */}
      {respondTo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-white mb-1">{respondTo.title}</h2>
            {respondTo.description && (
              <p className="text-text-secondary text-sm mb-3">{respondTo.description}</p>
            )}
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={8}
              placeholder="Type your answer here…"
              className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none"
            />
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setRespondTo(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitResponse}
                disabled={isSubmittingResponse || !responseText.trim()}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                {isSubmittingResponse ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "timetable" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          {days.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No teaching days yet.</p>
          ) : (
            <div className="divide-y divide-border-strong">
              {days.map((d) => (
                <div key={d.id} className="flex items-center gap-4 py-3">
                  <span className="w-10 h-10 rounded-xl bg-bg-surface-elevated border border-border-strong flex items-center justify-center text-brand-400 font-mono text-sm shrink-0">
                    {d.dayNumber}
                  </span>
                  <div>
                    <p className="text-white text-sm">{d.scheduledDate}</p>
                    <p className="text-text-tertiary text-xs">{d.topic || "No topic"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          {attendance.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No attendance records yet.</p>
          ) : (
            <div className="divide-y divide-border-strong">
              {attendance.map((r) => (
                <div key={r.teachingDayId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-white text-sm">
                      Day {r.dayNumber} — {r.scheduledDate}
                    </p>
                    <p className="text-text-tertiary text-xs">{r.topic || ""}</p>
                  </div>
                  {r.status ? (
                    <span
                      className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${ATTENDANCE_COLORS[r.status]}`}
                    >
                      {r.status}
                    </span>
                  ) : (
                    <span className="text-text-tertiary text-xs">not recorded</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "report" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          {!report ? (
            <p className="text-text-secondary text-sm py-8 text-center">
              Your report will be available after the class ends and the teacher generates it.
            </p>
          ) : (
            <div>
              <p className="text-text-tertiary text-xs font-mono mb-4">
                {report.live ? (
                  <span className="text-emerald-400">LIVE — updates automatically</span>
                ) : (
                  <>Generated {new Date(report.generatedAt).toLocaleString()}</>
                )}{" "}
                · conducted {report.totalConductedDays}/{report.totalScheduledDays} days
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Attendance", value: `${report.attendance.attendanceRate}%` },
                  {
                    label: "Submitted",
                    value: `${report.summary.submittedCount}/${report.summary.totalActivities}`,
                  },
                  { label: "Average Score", value: report.summary.averageScore ?? "—" },
                  { label: "Highest Score", value: report.summary.highestScore ?? "—" },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="bg-bg-base border border-border-strong rounded-xl p-4 text-center"
                  >
                    <p className="text-lg font-bold text-white">{c.value}</p>
                    <p className="text-text-tertiary text-xs mt-1">{c.label}</p>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-border-strong">
                {report.activities.map((a: any) => (
                  <div key={a.activityId} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${TYPE_BADGE[a.type]}`}
                      >
                        {a.type}
                      </span>
                      <p className="text-white text-sm">{a.title}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-xs font-mono ${STATUS_COLORS[a.submissionStatus] || "text-text-tertiary"}`}
                      >
                        {a.submissionStatus}
                      </span>
                      <div className="w-24 h-1.5 bg-bg-surface-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            (a.scorePercentage ?? 0) >= 50 ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, a.scorePercentage ?? 0)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-text-secondary w-14 text-right">
                        {a.scorePercentage !== null ? `${a.scorePercentage}%` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
