"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface ExamGroup {
  examId: string;
  examTitle: string;
  examDescription: string;
  totalPossibleScore: string;
  totalTaken: number;
  totalCompleted: number;
  totalPass: number;
  totalFail: number;
  totalPending: number;
  totalCancelled: number;
  lastSubmittedAt: string | null;
  bestScore: string | null;
}

interface ExamSubmission {
  id: string;
  startAt: string;
  submittedAt: string | null;
  totalScore: string | null;
  focusLossCount: number;
  elapsedSeconds: number;
  totalPossibleScore: string;
  quizScore: string; quizTotal: string;
  codeScore: string; codeTotal: string;
  xpathScore: string; xpathTotal: string;
}

interface SubmissionDetail {
  questionId: string;
  questionTitle: string;
  questionType: "QUIZ" | "CODE" | "XPATH";
  questionPoints: string;
  questionContent: string;
  score: string;
  status: string | null;
  language: string | null;
  sourceCode: string | null;
  studentXpath: string | null;
  selectedOptions: string[] | null;
  selectedTexts: string[];
  correctTexts: string[];
  result: "PASS" | "FAIL" | "NOT COMPLETED";
}

interface DetailData {
  submission: {
    id: string; examTitle: string; totalScore: string;
    totalPossibleScore: string; elapsedSeconds: number;
    submittedAt: string; focusLossCount: number;
  };
  details: SubmissionDetail[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function pct(score: string | null, total: string) {
  if (!score) return 0;
  const t = Number(total);
  return t > 0 ? (Number(score) / t) * 100 : 0;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function scoreBg(p: number) {
  if (p >= 80) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (p >= 50) return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-rose-500/10 border-rose-500/20 text-rose-400";
}

function scoreColor(p: number) {
  if (p >= 80) return "text-emerald-400";
  if (p >= 50) return "text-amber-400";
  return "text-rose-400";
}

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</span>
    </div>
  );
}

function TypeChip({ label, score, total, color }: { label: string; score: string; total: string; color: string }) {
  if (Number(total) === 0) return null;
  const p = pct(score, total);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${color}`}>
      {label}: {Number(score).toFixed(1)}/{Number(total).toFixed(1)} · {p.toFixed(0)}%
    </span>
  );
}

function ScoreBadge({ score, total }: { score: string | null; total: string }) {
  if (!score) return <span className="text-xs text-text-tertiary italic">—</span>;
  const p = pct(score, total);
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${scoreBg(p)}`}>
      {Number(score).toFixed(1)}/{Number(total).toFixed(1)} · {p.toFixed(1)}%
    </span>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "PASS") return <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ PASS</span>;
  if (result === "FAIL") return <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-rose-500/10 text-rose-400 border-rose-500/20">✕ FAIL</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">— N/A</span>;
}

function ExpandableCode({ code, language }: { code: string; language: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? "Collapse" : "View Code"}
        {language && <span className="font-mono text-[10px] text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{language}</span>}
      </button>
      {open && (
        <pre className="mt-2 font-mono text-xs text-text-secondary bg-bg-base border border-border-strong rounded-lg p-3 overflow-x-auto max-h-44 whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Score Trend chart ──────────────────────────────────────────────────── */
function MiniTrend({ submissions }: { submissions: ExamSubmission[] }) {
  const done = submissions.filter(s => s.submittedAt).slice(0, 10);
  if (done.length < 2) return null;

  const W = 560, H = 160;
  const LEFT = 44, RIGHT = 60, TOP = 28, BOTTOM = 36;
  const chartW = W - LEFT - RIGHT;
  const chartH = H - TOP - BOTTOM;

  const pts = done.map((s, i) => {
    const p = pct(s.totalScore, s.totalPossibleScore);
    return {
      x: LEFT + (done.length === 1 ? chartW / 2 : (i / (done.length - 1)) * chartW),
      y: TOP + (1 - p / 100) * chartH,
      pct: p,
      date: new Date(s.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const fillPath = linePath
    + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(TOP + chartH).toFixed(1)}`
    + ` L ${pts[0].x.toFixed(1)} ${(TOP + chartH).toFixed(1)} Z`;

  const gridLines = [0, 25, 50, 75, 100];
  const passY = TOP + (1 - 50 / 100) * chartH;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 140 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y-axis labels */}
        {gridLines.map(v => {
          const y = TOP + (1 - v / 100) * chartH;
          const isPass = v === 50;
          return (
            <g key={v}>
              <line
                x1={LEFT} y1={y} x2={W - RIGHT} y2={y}
                stroke={isPass ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.07)"}
                strokeWidth={isPass ? "1.5" : "1"}
                strokeDasharray={isPass ? "5 3" : undefined}
              />
              <text x={LEFT - 6} y={y + 4} textAnchor="end" fontSize="9"
                fill={isPass ? "rgba(251,191,36,0.8)" : "rgba(255,255,255,0.3)"}
                fontWeight={isPass ? "700" : "400"}>
                {v}%
              </text>
            </g>
          );
        })}

        {/* Pass line label on the right */}
        <text x={W - RIGHT + 4} y={passY + 4} textAnchor="start" fontSize="8.5" fill="rgba(251,191,36,0.7)" fontWeight="600">pass</text>

        {/* Fill area */}
        <path d={fillPath} fill="url(#trendFill)" />

        {/* Trend line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {pts.map((p, i) => {
          const color = p.pct >= 80 ? "#34d399" : p.pct >= 50 ? "#fbbf24" : "#f87171";
          // Score label: always above dot, but clamp so it never goes above TOP
          const labelY = Math.max(TOP + 10, p.y - 12);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5.5" fill={color} stroke="#0f0f1a" strokeWidth="2" />
              {/* Score % label above dot */}
              <text x={p.x} y={labelY} textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
                {p.pct.toFixed(0)}%
              </text>
              {/* Attempt # */}
              <text x={p.x} y={H - 18} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)">
                #{i + 1}
              </text>
              {/* Date */}
              <text x={p.x} y={H - 6} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.35)">
                {p.date}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function CompletedExamsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<ExamGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Exam detail panel (list of submissions for one exam)
  const [selectedGroup, setSelectedGroup] = useState<ExamGroup | null>(null);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Question detail drawer (per-question results for one submission)
  const [questionDetail, setQuestionDetail] = useState<DetailData | null>(null);
  const [questionDetailLoading, setQuestionDetailLoading] = useState(false);
  const [questionDetailOpen, setQuestionDetailOpen] = useState(false);

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroups = async () => {
    try {
      const res = await fetch("/api/v1/student/exam-groups");
      if (res.ok) setGroups((await res.json()).groups || []);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const openExamDetail = async (group: ExamGroup) => {
    setSelectedGroup(group);
    setSubmissions([]);
    setSubmissionsLoading(true);
    try {
      const res = await fetch(`/api/v1/student/exam-groups/${group.examId}`);
      if (res.ok) setSubmissions((await res.json()).submissions || []);
    } catch (e) { console.error(e); }
    finally { setSubmissionsLoading(false); }
  };

  const openQuestionDetail = async (submissionId: string) => {
    setQuestionDetailOpen(true);
    setQuestionDetailLoading(true);
    setQuestionDetail(null);
    try {
      const res = await fetch(`/api/v1/student/completed/${submissionId}`);
      if (res.ok) setQuestionDetail(await res.json());
    } catch (e) { console.error(e); }
    finally { setQuestionDetailLoading(false); }
  };

  /* ── Summary stats ── */
  const totalExams = groups.length;
  const totalAttempts = groups.reduce((s, g) => s + Number(g.totalTaken), 0);
  const totalPass = groups.reduce((s, g) => s + Number(g.totalPass), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">My Exam Results</h1>
            <p className="text-text-secondary mt-1 text-sm">
              View your performance grouped by exam. Click any row to see all your attempts.
            </p>
          </div>
          <button onClick={() => router.push("/student/exams")}
            className="premium-btn-secondary py-2 px-4 text-sm shrink-0">
            Active Exams →
          </button>
        </div>

        {/* Top stats */}
        {groups.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Exams", value: totalExams, icon: "🎓", color: "text-brand-400" },
              { label: "Total Attempts", value: totalAttempts, icon: "📝", color: "text-white" },
              { label: "Total Passed", value: totalPass, icon: "✅", color: "text-emerald-400" },
            ].map(s => (
              <div key={s.label} className="glass-card p-4 flex items-center gap-4">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-text-tertiary text-xs">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No exam history yet</h3>
            <p className="text-text-secondary text-sm mb-6">Start an exam to see your results here.</p>
            <button onClick={() => router.push("/student/exams")} className="premium-btn-primary py-2 px-6 text-sm">
              View Active Exams
            </button>
          </div>
        ) : (
          /* ── Exam groups table ── */
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-strong text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                    <th className="py-3.5 px-5">Exam</th>
                    <th className="py-3.5 px-4 text-center">Taken</th>
                    <th className="py-3.5 px-4 text-center">Completed</th>
                    <th className="py-3.5 px-4 text-center">Pass</th>
                    <th className="py-3.5 px-4 text-center">Fail</th>
                    <th className="py-3.5 px-4 text-center">Pending</th>
                    <th className="py-3.5 px-4 text-center">Cancelled</th>
                    <th className="py-3.5 px-4 text-center">Best Score</th>
                    <th className="py-3.5 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {groups.map(g => {
                    const bp = pct(g.bestScore, g.totalPossibleScore);
                    const isSelected = selectedGroup?.examId === g.examId;
                    return (
                      <tr key={g.examId}
                        className={`transition-colors cursor-pointer group ${isSelected ? "bg-brand-500/5" : "hover:bg-white/[0.02]"}`}
                        onClick={() => openExamDetail(g)}>
                        <td className="py-4 px-5">
                          <div className={`font-semibold text-sm transition-colors ${isSelected ? "text-brand-300" : "text-white group-hover:text-brand-300"}`}>
                            {g.examTitle}
                          </div>
                          {g.lastSubmittedAt && (
                            <div className="text-text-tertiary text-xs mt-0.5">
                              Last: {formatDate(g.lastSubmittedAt)}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-white font-bold text-sm">{g.totalTaken}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-brand-400 font-bold text-sm">{g.totalCompleted}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {g.totalPass}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {g.totalFail}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {Number(g.totalPending) > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {g.totalPending}
                            </span>
                          ) : (
                            <span className="text-text-tertiary text-xs">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {Number(g.totalCancelled) > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                              {g.totalCancelled}
                            </span>
                          ) : (
                            <span className="text-text-tertiary text-xs">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {g.bestScore ? (
                            <span className={`font-mono text-xs font-bold ${scoreColor(bp)}`}>
                              {Number(g.bestScore).toFixed(1)}/{Number(g.totalPossibleScore).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-text-tertiary text-xs">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={`text-xs font-semibold transition-all ${isSelected ? "text-brand-400" : "text-text-tertiary opacity-0 group-hover:opacity-100"}`}>
                            {isSelected ? "▲ Hide" : "Details →"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Inline exam detail panel ── */}
        {selectedGroup && (
          <div className="glass-card overflow-hidden">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-border-strong bg-bg-surface-elevated/40 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">{selectedGroup.examTitle}</h2>
                <p className="text-text-tertiary text-xs mt-0.5">
                  All your attempts · sorted by earliest first
                </p>
              </div>
              <button onClick={() => setSelectedGroup(null)}
                className="text-text-tertiary hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {submissionsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
              </div>
            ) : submissions.length === 0 ? (
              <p className="text-text-tertiary text-sm text-center py-10">No attempts found.</p>
            ) : (
              <>
                {/* Mini trend chart */}
                {submissions.filter(s => s.submittedAt).length >= 2 && (
                  <div className="px-6 pt-4 pb-2 border-b border-border-strong">
                    <p className="text-text-tertiary text-xs mb-2">Score trend across attempts</p>
                    <MiniTrend submissions={submissions} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-strong text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                        <th className="py-3 px-5">#</th>
                        <th className="py-3 px-4">Date &amp; Time</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Breakdown</th>
                        <th className="py-3 px-4">Focus Losses</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4">Result</th>
                        <th className="py-3 px-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {submissions.map((s, idx) => {
                        const submitted = !!s.submittedAt;
                        const p = submitted ? pct(s.totalScore, s.totalPossibleScore) : 0;
                        const passStatus = !submitted ? "incomplete"
                          : p >= 50 ? "pass" : "fail";
                        return (
                          <tr key={s.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="py-3.5 px-5 text-text-tertiary text-xs font-mono">#{idx + 1}</td>
                            <td className="py-3.5 px-4">
                              <div className="text-sm text-white">{formatDate(s.startAt)}</div>
                              {s.submittedAt && (
                                <div className="text-xs text-text-tertiary mt-0.5">
                                  Submitted: {formatDate(s.submittedAt)}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-text-secondary text-sm">
                              {submitted && s.elapsedSeconds ? formatElapsed(s.elapsedSeconds) : "—"}
                            </td>
                            <td className="py-3.5 px-4">
                              {submitted ? (
                                <div className="flex flex-wrap gap-1">
                                  <TypeChip label="Quiz" score={s.quizScore} total={s.quizTotal} color="bg-brand-500/10 border-brand-500/20 text-brand-400" />
                                  <TypeChip label="Code" score={s.codeScore} total={s.codeTotal} color="bg-amber-500/10 border-amber-500/20 text-amber-400" />
                                  <TypeChip label="XPath" score={s.xpathScore} total={s.xpathTotal} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" />
                                </div>
                              ) : (
                                <span className="text-xs text-text-tertiary italic">Not submitted</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {submitted ? (
                                s.focusLossCount > 0 ? (
                                  <span className="text-amber-400 text-xs font-semibold">⚠ {s.focusLossCount}×</span>
                                ) : (
                                  <span className="text-emerald-400 text-xs font-semibold">✓ Clean</span>
                                )
                              ) : <span className="text-text-tertiary text-xs">—</span>}
                            </td>
                            <td className="py-3.5 px-4">
                              <ScoreBadge score={s.totalScore} total={s.totalPossibleScore} />
                            </td>
                            <td className="py-3.5 px-4">
                              {passStatus === "pass" && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ Pass</span>
                              )}
                              {passStatus === "fail" && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-rose-500/10 text-rose-400 border-rose-500/20">✕ Fail</span>
                              )}
                              {passStatus === "incomplete" && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">— Incomplete</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {submitted && (
                                <button onClick={() => openQuestionDetail(s.id)}
                                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                  Details →
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Per-question detail drawer ────────────────────────────────────── */}
      {questionDetailOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setQuestionDetailOpen(false)} />
          <div className="relative w-full max-w-2xl h-full bg-bg-surface border-l border-border-strong flex flex-col shadow-2xl">

            <div className="px-6 py-5 border-b border-border-strong flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{questionDetail?.submission.examTitle ?? "Attempt Details"}</h2>
                {questionDetail && (
                  <p className="text-text-tertiary text-xs mt-1">
                    {formatDate(questionDetail.submission.submittedAt)} · {formatElapsed(questionDetail.submission.elapsedSeconds)}
                  </p>
                )}
              </div>
              <button onClick={() => setQuestionDetailOpen(false)} className="text-text-tertiary hover:text-white transition-colors mt-0.5 ml-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {questionDetail && (
              <div className="px-6 py-3 border-b border-border-strong bg-bg-surface-elevated/30 flex items-center justify-between gap-4 shrink-0 flex-wrap">
                <div className="flex items-center gap-5">
                  <div>
                    <span className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Time Taken</span>
                    <span className="font-mono text-sm text-white">{formatElapsed(questionDetail.submission.elapsedSeconds)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Focus Losses</span>
                    <span className={`font-mono text-sm font-semibold ${questionDetail.submission.focusLossCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {questionDetail.submission.focusLossCount === 0 ? "None" : `${questionDetail.submission.focusLossCount}×`}
                    </span>
                  </div>
                </div>
                <ScoreBadge score={questionDetail.submission.totalScore} total={questionDetail.submission.totalPossibleScore} />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {questionDetailLoading ? (
                <div className="flex justify-center py-20">
                  <div className="w-7 h-7 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : questionDetail?.details.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-10">No details available.</p>
              ) : (
                questionDetail?.details.map((d, i) => {
                  const s = Number(d.score), q = Number(d.questionPoints);
                  const qp = q > 0 ? (s / q) * 100 : 0;
                  return (
                    <div key={d.questionId} className="border border-border-strong rounded-xl overflow-hidden">
                      <div className="bg-bg-surface-elevated/50 px-4 py-3 flex items-start justify-between gap-4 border-b border-border-strong">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-text-tertiary">#{i + 1}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              d.questionType === "CODE" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : d.questionType === "XPATH" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-brand-500/10 text-brand-400 border-brand-500/20"
                            }`}>{d.questionType}</span>
                            {d.language && <span className="text-[10px] font-mono text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{d.language}</span>}
                          </div>
                          <div className="text-sm font-semibold text-white">{d.questionTitle}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <ResultBadge result={d.result} />
                          <div className={`inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${scoreBg(qp)}`}>
                            {s.toFixed(1)}<span className="opacity-40">/</span>{q.toFixed(1)}
                          </div>
                        </div>
                      </div>
                      <div className="bg-bg-base px-4 py-3 space-y-3">
                        {d.questionType === "XPATH" ? (
                          d.studentXpath
                            ? <pre className="font-mono text-xs text-emerald-300 bg-bg-base border border-emerald-500/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{d.studentXpath}</pre>
                            : <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No answer submitted</div>
                        ) : d.questionType === "QUIZ" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Your Answer</div>
                              <div className="space-y-1.5">
                                {d.selectedTexts?.length > 0 ? d.selectedTexts.map((t, ti) => (
                                  <div key={ti} className={`text-xs px-3 py-2 rounded-lg border ${d.result === "PASS" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" : "bg-rose-500/5 border-rose-500/20 text-rose-300"}`}>{t}</div>
                                )) : <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No answer selected</div>}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Correct Answer</div>
                              <div className="space-y-1.5">
                                {d.correctTexts?.length > 0 ? d.correctTexts.map((t, ti) => (
                                  <div key={ti} className="text-xs px-3 py-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-emerald-300">✓ {t}</div>
                                )) : <div className="text-xs text-text-tertiary italic">—</div>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Submitted Code</div>
                            {d.sourceCode
                              ? <ExpandableCode code={d.sourceCode} language={d.language} />
                              : <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No code submitted</div>}
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
