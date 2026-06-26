"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─────────────────────────── helpers ─────────────────────────────────────── */
function todayISO() {
  // Use local date (not UTC) so teachers in UTC+7 see the correct "today"
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// Client UTC offset in minutes (e.g. +420 for UTC+7 Vietnam)
function tzOffsetMinutes() {
  return -new Date().getTimezoneOffset(); // getTimezoneOffset returns negative for UTC+
}

function fmt(dt: string | Date | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(dt: string | Date | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function elapsed(start: string | Date, end: string | Date | null): string {
  if (!end) return "—";
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ─────────────────────────── badges ──────────────────────────────────────── */
function ResultBadge({ result }: { result: string }) {
  if (result === "PASS")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        PASS
      </span>
    );
  if (result === "FAIL")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/25">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
        FAIL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/25">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
      </svg>
      IN PROGRESS
    </span>
  );
}

function ScoreBadge({ score, total }: { score: string | null; total: string }) {
  if (score === null || score === undefined)
    return <span className="text-text-tertiary text-xs font-mono">—</span>;
  const s = Number(score);
  const t = Number(total);
  const pct = t > 0 ? (s / t) * 100 : 0;
  const cls =
    pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-rose-400";
  return (
    <span className={`font-mono text-xs font-bold tabular-nums ${cls}`}>
      {s.toFixed(1)}/{t.toFixed(1)}
      <span className="text-text-tertiary font-normal ml-1">({pct.toFixed(0)}%)</span>
    </span>
  );
}

/* ─────────────────────────── stat pill ───────────────────────────────────── */
function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${color} min-w-[72px]`}>
      <span className="text-lg font-black tabular-nums leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70 font-semibold">{label}</span>
    </div>
  );
}

/* ─────────────────────────── main page ───────────────────────────────────── */
export default function SessionsPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSessions = useCallback(async (d: string) => {
    try {
      setFetchError(null);
      const res = await fetch(`/api/v1/teacher/sessions?date=${d}&tz=${tzOffsetMinutes()}`);
      const data = await res.json();
      if (res.ok) {
        setSessions(data.sessions ?? []);
      } else {
        setFetchError(data.message ?? `Server error ${res.status}`);
      }
    } catch (err) {
      setFetchError("Network error — could not reach server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial + manual refresh
  useEffect(() => {
    setIsLoading(true);
    fetchSessions(date);
  }, [date, fetchSessions]);

  // Auto-refresh every 30 s when viewing today
  useEffect(() => {
    if (!autoRefresh || date !== todayISO()) return;
    const id = setInterval(() => fetchSessions(date), 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, date, fetchSessions]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const isToday = date === todayISO();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
            <button
              onClick={() => router.push("/teacher")}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Exams
            </button>
            <span>›</span>
            <span className="text-text-secondary">Session Monitor</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Session Monitor</h1>
          <p className="text-text-secondary text-sm mt-1">Track exam sessions, student participation, and results.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Auto-refresh toggle (only for today) */}
          {isToday && (
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                autoRefresh
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-bg-surface border-border-strong text-text-tertiary"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-text-tertiary"}`} />
              {autoRefresh ? "Live" : "Paused"}
            </button>
          )}
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(date);
                d.setDate(d.getDate() - 1);
                setDate(d.toISOString().slice(0, 10));
              }}
              className="p-1.5 rounded-lg border border-border-strong text-text-secondary hover:text-white hover:bg-bg-surface transition-colors"
              title="Previous day"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={e => e.target.value && setDate(e.target.value)}
              className="bg-bg-surface border border-border-strong text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500 cursor-pointer"
            />
            <button
              onClick={() => {
                if (date >= todayISO()) return;
                const d = new Date(date);
                d.setDate(d.getDate() + 1);
                setDate(d.toISOString().slice(0, 10));
              }}
              disabled={date >= todayISO()}
              className="p-1.5 rounded-lg border border-border-strong text-text-secondary hover:text-white hover:bg-bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next day"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setDate(todayISO())}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                isToday
                  ? "bg-brand-500/10 border-brand-500/25 text-brand-400"
                  : "border-border-strong text-text-secondary hover:text-white hover:bg-bg-surface"
              }`}
            >
              Today
            </button>
          </div>
          <button
            onClick={() => { setIsLoading(true); fetchSessions(date); }}
            className="p-1.5 rounded-lg border border-border-strong text-text-secondary hover:text-white hover:bg-bg-surface transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {fetchError && !isLoading && (
        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm mb-4">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>Failed to load sessions: {fetchError}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-text-secondary">
          <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mr-3" />
          Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-bg-surface border border-border-strong flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-white font-semibold">No exam sessions on {fmtDate(date + "T00:00:00Z")}</p>
          <p className="text-text-secondary text-sm mt-1">No students started any of your exams on this date.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map(session => {
            const isOpen = expanded.has(session.examId);
            const passCount = session.students.filter((s: any) => s.result === "PASS").length;
            const failCount = session.students.filter((s: any) => s.result === "FAIL").length;
            const inProgressCount = session.students.filter((s: any) => s.result === "NOT_COMPLETED").length;

            return (
              <div key={session.examId} className="glass-card overflow-hidden">
                {/* Exam header row */}
                <button
                  onClick={() => toggle(session.examId)}
                  className="w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-bg-surface-elevated/30 transition-colors"
                >
                  {/* Left: exam info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-bold text-base truncate">{session.examTitle}</h2>
                      {isToday && inProgressCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary flex-wrap">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {fmtDate(session.startTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {fmt(session.startTime)} – {fmt(session.endTime)}
                      </span>
                      <span>{session.duration} min</span>
                    </div>
                  </div>

                  {/* Stats pills */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <StatPill label="Started" value={session.totalStarted} color="bg-bg-surface border-border-strong text-text-secondary" />
                    <StatPill label="Done" value={session.totalCompleted} color="bg-brand-500/8 border-brand-500/20 text-brand-400" />
                    <StatPill label="Pass" value={passCount} color="bg-emerald-500/8 border-emerald-500/20 text-emerald-400" />
                    <StatPill label="Fail" value={failCount} color="bg-rose-500/8 border-rose-500/20 text-rose-400" />
                    {inProgressCount > 0 && (
                      <StatPill label="Active" value={inProgressCount} color="bg-amber-500/8 border-amber-500/20 text-amber-400" />
                    )}
                  </div>

                  {/* Chevron + Live monitor link */}
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/teacher/exams/${session.examId}/monitor`); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-500/30 text-brand-400 hover:bg-brand-500/10 transition-colors whitespace-nowrap"
                    >
                      Live Monitor
                    </button>
                    <svg
                      className={`w-5 h-5 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Progress bar */}
                {session.totalStarted > 0 && (
                  <div className="px-5 pb-1">
                    <div className="h-1 w-full bg-bg-base rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(passCount / session.totalStarted) * 100}%` }}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all"
                        style={{ width: `${(failCount / session.totalStarted) * 100}%` }}
                      />
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${(inProgressCount / session.totalStarted) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-4 mt-1 mb-2 text-[10px] text-text-tertiary">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Pass</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" />Fail</span>
                      {inProgressCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />In Progress</span>}
                    </div>
                  </div>
                )}

                {/* Expanded: per-student table */}
                {isOpen && (
                  <div className="border-t border-border-strong overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-bg-surface-elevated/40 border-b border-border-strong text-[11px] uppercase tracking-wider text-text-tertiary">
                          <th className="text-left px-4 py-2.5 font-semibold">Student</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Started</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Submitted</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Duration</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Score</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Result</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Focus Loss</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Close Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-strong">
                        {session.students.map((stu: any, i: number) => (
                          <tr
                            key={stu.submissionId}
                            className={`hover:bg-bg-surface-elevated/20 transition-colors ${i % 2 === 0 ? "" : "bg-bg-base/30"}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white text-xs">{stu.studentName}</div>
                              <div className="text-text-tertiary text-[11px] font-mono">@{stu.username}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary font-mono whitespace-nowrap">{fmt(stu.startAt)}</td>
                            <td className="px-4 py-3 text-xs text-text-secondary font-mono whitespace-nowrap">{fmt(stu.submittedAt)}</td>
                            <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{elapsed(stu.startAt, stu.submittedAt)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {stu.submittedAt
                                ? <ScoreBadge score={stu.totalScore} total={stu.totalPossibleScore} />
                                : <span className="text-text-tertiary text-xs">—</span>
                              }
                            </td>
                            <td className="px-4 py-3"><ResultBadge result={stu.result} /></td>
                            <td className="px-4 py-3 text-xs">
                              <span className={`font-mono font-bold ${stu.focusLossCount > 0 ? "text-amber-400" : "text-text-tertiary"}`}>
                                {stu.focusLossCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-tertiary">
                              {stu.closeReason
                                ? <span className="font-mono text-[11px] bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{stu.closeReason}</span>
                                : "—"
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
