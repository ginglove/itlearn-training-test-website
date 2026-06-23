"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ── Score badge (same format as student page) ───────────────────────────── */
function ScoreBadge({ score, total }: { score: string | null; total: string }) {
  if (score === null) {
    return (
      <span className="font-mono text-xs text-text-tertiary bg-bg-surface border border-border-strong rounded-lg px-2.5 py-1">
        —
      </span>
    );
  }
  const s = Number(score);
  const t = Number(total);
  const pct = t > 0 ? (s / t) * 100 : 0;
  const cls =
    pct >= 80
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : pct >= 50
      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
      : "bg-rose-500/10 border-rose-500/20 text-rose-400";
  return (
    <div className={`inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 ${cls}`}>
      <span className="font-mono text-sm font-bold tracking-tight">
        {s.toFixed(1)}
        <span className="opacity-40 mx-1 font-normal">/</span>
        {t.toFixed(1)}
        <span className="text-xs font-normal ml-1 opacity-60">pts</span>
      </span>
      <span className="h-3.5 w-px bg-current opacity-20" />
      <span className="text-xs font-bold tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

/* ── Result badge: PASS / FAIL / NOT COMPLETED ───────────────────────────── */
function ResultBadge({ result }: { result: string }) {
  if (result === "PASS")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        PASS
      </span>
    );
  if (result === "FAIL")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border bg-rose-500/10 text-rose-400 border-rose-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
        FAIL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
      </svg>
      NOT COMPLETED
    </span>
  );
}

/* ── Expandable code row ─────────────────────────────────────────────────── */
function CodeExpandRow({ code, language }: { code: string; language: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? "Collapse" : "View Code"}
        {language && (
          <span className="text-[10px] font-mono text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">
            {language}
          </span>
        )}
      </button>
      {open && (
        <pre className="mt-2 font-mono text-xs text-text-secondary bg-bg-base border border-border-strong rounded-lg p-3 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function CodingMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  const [students, setStudents] = useState<any[]>([]);
  const [totalPossibleScore, setTotalPossibleScore] = useState("0");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let eventSource: EventSource;
    const connectSSE = () => {
      eventSource = new EventSource(`/api/v1/teacher/exams/${examId}/monitor`);
      eventSource.addEventListener("update", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStudents(data.roster);
          setTotalPossibleScore(data.totalPossibleScore ?? "0");
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      });
      eventSource.onerror = () => {
        eventSource.close();
        setTimeout(connectSSE, 5000);
      };
    };
    connectSSE();
    return () => { if (eventSource) eventSource.close(); };
  }, [examId]);

  const completed = students.filter((s) => s.submittedAt);
  const inProgress = students.filter((s) => !s.submittedAt);

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8 flex justify-between items-end border-b border-border-strong pb-6">
          <div>
            <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
              <button onClick={() => router.push("/teacher")} className="hover:text-white transition-colors">Exams</button>
              <span>›</span>
              <span className="text-text-secondary">Live Monitor</span>
            </div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              Live Exam Monitor
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </h1>
            <p className="text-text-secondary mt-1 text-sm">Real-time surveillance · Updates every 5 seconds.</p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-2xl font-mono text-white">{students.length}</div>
              <div className="text-xs text-text-tertiary uppercase tracking-wider">Total</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-brand-400">{inProgress.length}</div>
              <div className="text-xs text-text-tertiary uppercase tracking-wider">In Progress</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-emerald-400">{completed.length}</div>
              <div className="text-xs text-text-tertiary uppercase tracking-wider">Completed</div>
            </div>
          </div>
        </div>

        {/* ── Roster table ── */}
        <div className="glass-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-surface-elevated/50 border-b border-border-strong">
                {["Student", "IP", "Focus Losses", "Time Elapsed", "Status", "Score", ""].map((h) => (
                  <th key={h} className="p-4 text-xs font-medium text-text-tertiary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-text-tertiary">
                    <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
                    Waiting for students to join...
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const isExpanded = expandedId === student.id;
                  return (
                    <>
                      {/* ── Student row ── */}
                      <tr key={student.id} className="hover:bg-bg-surface-elevated/30 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-white">{student.studentName}</div>
                          <div className="text-xs text-text-tertiary font-mono">{student.studentUsername}</div>
                        </td>
                        <td className="p-4 text-sm font-mono text-text-secondary">{student.clientIp}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            student.focusLossCount > 3 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : student.focusLossCount > 0 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {student.focusLossCount}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-sm text-text-secondary">
                            {formatElapsed(student.elapsedSeconds ?? 0)}
                          </span>
                          {student.submittedAt && (
                            <div className="text-xs text-text-tertiary mt-0.5">completed</div>
                          )}
                        </td>
                        <td className="p-4">
                          {student.submittedAt ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-lg">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Submitted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2.5 py-1 rounded-lg">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                              In Progress
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <ScoreBadge score={student.totalScore} total={totalPossibleScore} />
                        </td>
                        <td className="p-4">
                          {student.submittedAt && student.details?.length > 0 && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : student.id)}
                              className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                            >
                              {isExpanded ? "Hide" : "Details"}
                              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* ── Expandable detail section ── */}
                      {isExpanded && (
                        <tr key={`${student.id}-detail`}>
                          <td colSpan={7} className="bg-bg-surface-elevated/10 px-6 py-5 border-t border-border-strong/50">
                            <div className="border border-border-strong rounded-xl overflow-hidden">
                              <div className="bg-bg-surface px-4 py-3 border-b border-border-strong">
                                <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                  Answer Breakdown — {student.studentName}
                                </span>
                              </div>

                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-bg-surface-elevated/30 border-b border-border-strong">
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider w-8">#</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">Question</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">Student's Answer</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">Correct Answer</th>
                                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-text-tertiary uppercase tracking-wider">Result</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-text-tertiary uppercase tracking-wider">Score</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                  {student.details.map((d: any, i: number) => {
                                    const s = Number(d.score);
                                    const q = Number(d.questionPoints);
                                    const pct = q > 0 ? (s / q) * 100 : 0;
                                    const scoreColor =
                                      pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                        : pct >= 50 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                        : "bg-rose-500/10 border-rose-500/20 text-rose-400";

                                    return (
                                      <tr key={i} className="hover:bg-bg-surface/40 transition-colors align-top">
                                        {/* # */}
                                        <td className="px-4 py-3 text-text-tertiary text-xs font-mono">{i + 1}</td>

                                        {/* Question title + type */}
                                        <td className="px-4 py-3 max-w-[200px]">
                                          <div className="font-medium text-white text-sm leading-snug">{d.questionTitle}</div>
                                          <span className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                            d.questionType === "CODE"
                                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                              : "bg-brand-500/10 text-brand-400 border-brand-500/20"
                                          }`}>
                                            {d.questionType}
                                          </span>
                                        </td>

                                        {/* Student's answer */}
                                        <td className="px-4 py-3 max-w-[240px]">
                                          {d.questionType === "CODE" ? (
                                            d.sourceCode ? (
                                              <CodeExpandRow code={d.sourceCode} language={d.language} />
                                            ) : (
                                              <span className="text-xs text-text-tertiary italic">No code submitted</span>
                                            )
                                          ) : (
                                            <div className="space-y-1">
                                              {d.selectedTexts?.length > 0 ? (
                                                d.selectedTexts.map((t: string, ti: number) => (
                                                  <div key={ti} className="inline-flex items-center gap-1.5 text-xs bg-bg-surface border border-border-strong rounded-lg px-2 py-1 mr-1 mb-1 text-white">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                                                    {t}
                                                  </div>
                                                ))
                                              ) : (
                                                <span className="text-xs text-text-tertiary italic">No answer</span>
                                              )}
                                            </div>
                                          )}
                                        </td>

                                        {/* Correct answer */}
                                        <td className="px-4 py-3 max-w-[240px]">
                                          {d.questionType === "CODE" ? (
                                            <span className="text-xs text-text-tertiary italic">Graded by output</span>
                                          ) : (
                                            <div className="space-y-1">
                                              {d.correctTexts?.length > 0 ? (
                                                d.correctTexts.map((t: string, ti: number) => (
                                                  <div key={ti} className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2 py-1 mr-1 mb-1 text-emerald-400">
                                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    {t}
                                                  </div>
                                                ))
                                              ) : (
                                                <span className="text-xs text-text-tertiary">—</span>
                                              )}
                                            </div>
                                          )}
                                        </td>

                                        {/* Result */}
                                        <td className="px-4 py-3 text-center">
                                          <ResultBadge result={d.result} />
                                        </td>

                                        {/* Score */}
                                        <td className="px-4 py-3 text-right">
                                          <div className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${scoreColor}`}>
                                            {s.toFixed(1)}
                                            <span className="opacity-40 font-normal">/</span>
                                            {q.toFixed(1)}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
