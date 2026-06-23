"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface CompletedSubmission {
  id: string;
  examId: string;
  title: string;
  description: string;
  duration: number;
  submittedAt: string;
  totalScore: string;
  totalPossibleScore: string;
  focusLossCount: number;
}

interface SubmissionDetail {
  questionId: string;
  questionTitle: string;
  questionType: "QUIZ" | "CODE";
  questionPoints: string;
  questionContent: string;
  score: string;
  status: string | null;
  language: string | null;
  sourceCode: string | null;
  selectedOptions: string[] | null;
  selectedTexts: string[];
  correctTexts: string[];
  result: "PASS" | "FAIL" | "NOT COMPLETED";
}

interface DetailData {
  submission: {
    id: string;
    examTitle: string;
    totalScore: string;
    totalPossibleScore: string;
    elapsedSeconds: number;
    submittedAt: string;
    focusLossCount: number;
  };
  details: SubmissionDetail[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ── Shared UI components ────────────────────────────────────────────────── */
function ScoreBadge({ score, total }: { score: string; total: string }) {
  const s = Number(score ?? 0);
  const t = Number(total);
  const pct = t > 0 ? (s / t) * 100 : 0;
  const cls =
    pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : pct >= 50 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
      : "bg-rose-500/10 border-rose-500/20 text-rose-400";
  return (
    <div className={`inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 ${cls}`}>
      <span className="font-mono text-sm font-bold tracking-tight">
        {s.toFixed(1)}<span className="opacity-40 mx-1 font-normal">/</span>{t.toFixed(1)}
        <span className="text-xs font-normal ml-1 opacity-60">pts</span>
      </span>
      <span className="h-3.5 w-px bg-current opacity-20" />
      <span className="text-xs font-bold tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "PASS")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        PASS
      </span>
    );
  if (result === "FAIL")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-rose-500/10 text-rose-400 border-rose-500/20">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
        FAIL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
      </svg>
      NOT COMPLETED
    </span>
  );
}

function ExpandableCode({ code, language }: { code: string; language: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? "Collapse" : "View Your Code"}
        {language && (
          <span className="font-mono text-[10px] text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{language}</span>
        )}
      </button>
      {open && (
        <pre className="mt-2 font-mono text-xs text-text-secondary bg-bg-base border border-border-strong rounded-lg p-3 overflow-x-auto max-h-52 leading-relaxed whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function CompletedExamsPage() {
  const router = useRouter();
  const [completed, setCompleted] = useState<CompletedSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<DetailData | null>(null);

  useEffect(() => { fetchCompleted(); }, []);

  const fetchCompleted = async () => {
    try {
      const res = await fetch("/api/v1/student/completed");
      if (res.ok) {
        const data = await res.json();
        setCompleted(data.completed || []);
      }
    } catch (err) {
      console.error("Failed to load completed exams:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const openDetail = async (submissionId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/v1/student/completed/${submissionId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } catch (err) {
      console.error("Failed to load detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">Completed Exams</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Review your submitted assessments and final grades. Click any row to see detailed results.
          </p>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary text-sm">Loading historical submissions...</p>
          </div>
        ) : completed.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <svg className="w-12 h-12 text-text-tertiary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-medium text-white mb-2">No Completed Exams</h3>
            <p className="text-text-secondary text-sm mb-6">You have not completed any exams yet.</p>
            <button onClick={() => router.push("/student/exams")} className="premium-btn-primary py-2 px-6 text-sm">
              View Active Exams
            </button>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-strong text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    <th className="py-4 px-6">Assessment Title</th>
                    <th className="py-4 px-6">Submitted Date</th>
                    <th className="py-4 px-6">Duration</th>
                    <th className="py-4 px-6">Focus Losses</th>
                    <th className="py-4 px-6 text-right">Score</th>
                    <th className="py-4 px-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-sm">
                  {completed.map((sub) => (
                    <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      onClick={() => openDetail(sub.id)}>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white group-hover:text-brand-300 transition-colors">{sub.title}</div>
                        {sub.description && (
                          <div className="text-text-tertiary text-xs mt-0.5 line-clamp-1 max-w-md">{sub.description}</div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-text-secondary">
                        {new Date(sub.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="py-4 px-6 text-text-secondary">{sub.duration} mins</td>
                      <td className="py-4 px-6">
                        {sub.focusLossCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {sub.focusLossCount} {sub.focusLossCount === 1 ? "switch" : "switches"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Clean
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <ScoreBadge score={sub.totalScore} total={sub.totalPossibleScore} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-xs text-brand-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end whitespace-nowrap">
                          View Details
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />

          {/* Drawer */}
          <div className="relative w-full max-w-2xl h-full bg-bg-surface border-l border-border-strong flex flex-col shadow-2xl">

            {/* Header */}
            <div className="px-6 py-5 border-b border-border-strong flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{detailData?.submission.examTitle ?? "Exam Details"}</h2>
                {detailData && (
                  <p className="text-text-tertiary text-xs mt-1">
                    Submitted {new Date(detailData.submission.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    &nbsp;·&nbsp;Completed in {formatElapsed(detailData.submission.elapsedSeconds)}
                  </p>
                )}
              </div>
              <button onClick={() => setDetailOpen(false)}
                className="text-text-tertiary hover:text-white transition-colors mt-0.5 ml-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary bar */}
            {detailData && (
              <div className="px-6 py-4 border-b border-border-strong bg-bg-surface-elevated/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="block text-xs text-text-tertiary uppercase tracking-wider mb-0.5">Time Taken</span>
                    <span className="font-mono text-sm text-white">{formatElapsed(detailData.submission.elapsedSeconds)}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-text-tertiary uppercase tracking-wider mb-0.5">Focus Losses</span>
                    <span className={`font-mono text-sm ${detailData.submission.focusLossCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {detailData.submission.focusLossCount}
                    </span>
                  </div>
                </div>
                <ScoreBadge score={detailData.submission.totalScore} total={detailData.submission.totalPossibleScore} />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {detailLoading ? (
                <div className="flex justify-center py-20">
                  <div className="w-7 h-7 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : detailData?.details.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-10">No question details available.</p>
              ) : (
                detailData?.details.map((d, i) => {
                  const s = Number(d.score);
                  const q = Number(d.questionPoints);
                  const pct = q > 0 ? (s / q) * 100 : 0;
                  const scoreColor =
                    pct >= 80 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : pct >= 50 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-400";

                  return (
                    <div key={d.questionId} className="border border-border-strong rounded-xl overflow-hidden">

                      {/* Question header */}
                      <div className="bg-bg-surface-elevated/50 px-4 py-3 flex items-start justify-between gap-4 border-b border-border-strong">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-text-tertiary">#{i + 1}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              d.questionType === "CODE"
                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                : "bg-brand-500/10 text-brand-400 border-brand-500/20"
                            }`}>{d.questionType}</span>
                            {d.language && (
                              <span className="text-[10px] font-mono text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{d.language}</span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-white">{d.questionTitle}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <ResultBadge result={d.result} />
                          <div className={`inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${scoreColor}`}>
                            {s.toFixed(1)}<span className="opacity-40 font-normal">/</span>{q.toFixed(1)}
                          </div>
                        </div>
                      </div>

                      {/* Answer comparison body */}
                      <div className="bg-bg-base px-4 py-3 space-y-3">

                        {d.questionType === "QUIZ" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Student answer */}
                            <div>
                              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Your Answer
                              </div>
                              <div className="space-y-1.5">
                                {d.selectedTexts?.length > 0 ? (
                                  d.selectedTexts.map((t, ti) => (
                                    <div key={ti} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                                      d.result === "PASS"
                                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                                        : "bg-rose-500/5 border-rose-500/20 text-rose-300"
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.result === "PASS" ? "bg-emerald-400" : "bg-rose-400"}`} />
                                      {t}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">
                                    No answer selected
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Correct answer */}
                            <div>
                              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-emerald-400">Correct Answer</span>
                              </div>
                              <div className="space-y-1.5">
                                {d.correctTexts?.length > 0 ? (
                                  d.correctTexts.map((t, ti) => (
                                    <div key={ti} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-emerald-300">
                                      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      </svg>
                                      {t}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-text-tertiary italic px-3 py-2">—</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* CODE question */
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                              Your Submitted Code
                            </div>
                            {d.sourceCode ? (
                              <ExpandableCode code={d.sourceCode} language={d.language} />
                            ) : (
                              <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">
                                No code submitted
                              </div>
                            )}
                            <p className="text-xs text-text-tertiary">
                              Code questions are graded by comparing your output against expected results.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
