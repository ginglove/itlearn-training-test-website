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
  elapsedSeconds: number;
  quizScore: string;
  quizTotal: string;
  codeScore: string;
  codeTotal: string;
  xpathScore: string;
  xpathTotal: string;
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
function pct(score: string, total: string) {
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

function scoreColor(p: number) {
  if (p >= 80) return "text-emerald-400";
  if (p >= 50) return "text-amber-400";
  return "text-rose-400";
}

function scoreBg(p: number) {
  if (p >= 80) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (p >= 50) return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-rose-500/10 border-rose-500/20 text-rose-400";
}

/* ── Sub-components ─────────────────────────────────────────────────────── */
function ScoreBadge({ score, total }: { score: string; total: string }) {
  const p = pct(score, total);
  return (
    <div className={`inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 ${scoreBg(p)}`}>
      <span className="font-mono text-sm font-bold">
        {Number(score).toFixed(1)}<span className="opacity-40 mx-1 font-normal">/</span>{Number(total).toFixed(1)}
        <span className="text-xs font-normal ml-1 opacity-60">pts</span>
      </span>
      <span className="h-3.5 w-px bg-current opacity-20" />
      <span className="text-xs font-bold tabular-nums">{p.toFixed(1)}%</span>
    </div>
  );
}

function TypeChip({ label, score, total, color }: { label: string; score: string; total: string; color: string }) {
  const t = Number(total);
  if (t === 0) return null;
  const p = pct(score, total);
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${color}`}>
      <span>{label}</span>
      <span className="opacity-40">·</span>
      <span className="font-mono">{Number(score).toFixed(1)}<span className="opacity-50">/{Number(total).toFixed(1)}</span></span>
      <span className="opacity-40">·</span>
      <span>{p.toFixed(0)}%</span>
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "PASS")
    return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ PASS</span>;
  if (result === "FAIL")
    return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg border bg-rose-500/10 text-rose-400 border-rose-500/20">✕ FAIL</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">— N/A</span>;
}

function ExpandableCode({ code, language }: { code: string; language: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors">
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? "Collapse" : "View Your Code"}
        {language && <span className="font-mono text-[10px] text-text-tertiary bg-bg-base border border-border-strong px-1.5 py-0.5 rounded">{language}</span>}
      </button>
      {open && (
        <pre className="mt-2 font-mono text-xs text-text-secondary bg-bg-base border border-border-strong rounded-lg p-3 overflow-x-auto max-h-52 leading-relaxed whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Score Trend SVG chart ──────────────────────────────────────────────── */
function ScoreTrendChart({ data }: { data: { label: string; pct: number }[] }) {
  if (data.length < 2) return null;
  const W = 420, H = 120, PAD = 16;
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - d.pct / 100) * (H - PAD * 2),
    pct: d.pct,
    label: d.label,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const fill = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(H - PAD).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(H - PAD).toFixed(1)} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 220 }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = PAD + (1 - v / 100) * (H - PAD * 2);
          return (
            <g key={v}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={PAD - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.25)">{v}%</text>
            </g>
          );
        })}
        {/* Fill area */}
        <path d={fill} fill="url(#trendGrad)" opacity="0.3" />
        {/* Line */}
        <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#6366f1" stroke="#0f0f1a" strokeWidth="1.5" />
            <title>{p.label}: {p.pct.toFixed(1)}%</title>
          </g>
        ))}
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* X labels */}
      <div className="flex justify-between px-4 mt-1">
        {pts.map((p, i) => (
          <span key={i} className="text-[9px] text-text-tertiary truncate max-w-[60px] text-center">{p.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Skill Bar ──────────────────────────────────────────────────────────── */
function SkillBar({ label, pct: p, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary font-medium">{label}</span>
        <span className={`font-bold ${scoreColor(p)}`}>{p.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "history">("dashboard");

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
      if (res.ok) setDetailData(await res.json());
    } catch (err) {
      console.error("Failed to load detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Derived stats ── */
  const totalExams = completed.length;
  const avgPct = totalExams === 0 ? 0
    : completed.reduce((s, c) => s + pct(c.totalScore, c.totalPossibleScore), 0) / totalExams;
  const bestPct = totalExams === 0 ? 0
    : Math.max(...completed.map(c => pct(c.totalScore, c.totalPossibleScore)));
  const totalFocusLosses = completed.reduce((s, c) => s + (c.focusLossCount || 0), 0);

  const quizAvg = (() => {
    const withQuiz = completed.filter(c => Number(c.quizTotal) > 0);
    if (!withQuiz.length) return null;
    return withQuiz.reduce((s, c) => s + pct(c.quizScore, c.quizTotal), 0) / withQuiz.length;
  })();
  const codeAvg = (() => {
    const withCode = completed.filter(c => Number(c.codeTotal) > 0);
    if (!withCode.length) return null;
    return withCode.reduce((s, c) => s + pct(c.codeScore, c.codeTotal), 0) / withCode.length;
  })();
  const xpathAvg = (() => {
    const withXpath = completed.filter(c => Number(c.xpathTotal) > 0);
    if (!withXpath.length) return null;
    return withXpath.reduce((s, c) => s + pct(c.xpathScore, c.xpathTotal), 0) / withXpath.length;
  })();

  const trendData = [...completed].reverse().slice(-10).map(c => ({
    label: c.title.length > 12 ? c.title.slice(0, 12) + "…" : c.title,
    pct: pct(c.totalScore, c.totalPossibleScore),
  }));

  /* ── Render ── */
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
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">My Results</h1>
            <p className="text-text-secondary mt-1 text-sm">Track your performance and skill progress across all assessments.</p>
          </div>
          <button onClick={() => router.push("/student/exams")} className="premium-btn-secondary py-2 px-4 text-sm shrink-0">
            Active Exams →
          </button>
        </div>

        {completed.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No completed exams yet</h3>
            <p className="text-text-secondary text-sm mb-6">Submit your first exam to see your scores and progress here.</p>
            <button onClick={() => router.push("/student/exams")} className="premium-btn-primary py-2 px-6 text-sm">
              View Active Exams
            </button>
          </div>
        ) : (
          <>
            {/* Tab navigation */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit border border-border-strong">
              {(["dashboard", "history"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                    activeTab === tab
                      ? "bg-brand-500 text-white shadow-lg"
                      : "text-text-secondary hover:text-white"
                  }`}>
                  {tab === "dashboard" ? "📊 Dashboard" : "📋 Exam History"}
                </button>
              ))}
            </div>

            {/* ── DASHBOARD TAB ── */}
            {activeTab === "dashboard" && (
              <div className="space-y-5">

                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Exams Taken", value: totalExams.toString(), sub: "completed", icon: "🎓", color: "text-brand-400" },
                    { label: "Average Score", value: `${avgPct.toFixed(1)}%`, sub: "across all exams", icon: "📈", color: scoreColor(avgPct) },
                    { label: "Best Score", value: `${bestPct.toFixed(1)}%`, sub: "personal record", icon: "🏆", color: scoreColor(bestPct) },
                    { label: "Focus Losses", value: totalFocusLosses.toString(), sub: "total tab switches", icon: "👁", color: totalFocusLosses === 0 ? "text-emerald-400" : totalFocusLosses <= 3 ? "text-amber-400" : "text-rose-400" },
                  ].map(s => (
                    <div key={s.label} className="glass-card p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-text-tertiary text-xs font-medium uppercase tracking-wider">{s.label}</span>
                        <span className="text-lg">{s.icon}</span>
                      </div>
                      <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-text-tertiary text-xs">{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                  {/* Score Trend */}
                  <div className="glass-card p-5 md:col-span-3">
                    <h3 className="text-sm font-semibold text-white mb-1">Score Trend</h3>
                    <p className="text-text-tertiary text-xs mb-4">Your score % across recent exams (oldest → newest)</p>
                    {trendData.length < 2 ? (
                      <p className="text-text-tertiary text-sm text-center py-8">Complete at least 2 exams to see your trend.</p>
                    ) : (
                      <ScoreTrendChart data={trendData} />
                    )}
                  </div>

                  {/* Skill breakdown */}
                  <div className="glass-card p-5 md:col-span-2 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1">Skill Breakdown</h3>
                      <p className="text-text-tertiary text-xs">Average score by assessment type</p>
                    </div>
                    <div className="space-y-4 pt-1">
                      {quizAvg !== null && <SkillBar label="Quiz / Multiple Choice" pct={quizAvg} color="bg-brand-500" />}
                      {codeAvg !== null && <SkillBar label="Coding" pct={codeAvg} color="bg-amber-500" />}
                      {xpathAvg !== null && <SkillBar label="XPath / CSS Selector" pct={xpathAvg} color="bg-emerald-500" />}
                      {quizAvg === null && codeAvg === null && xpathAvg === null && (
                        <p className="text-text-tertiary text-xs text-center py-4">No breakdown data yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Focus loss per exam */}
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-white mb-1">Focus & Integrity</h3>
                  <p className="text-text-tertiary text-xs mb-4">Tab switches detected per exam (lower is better)</p>
                  <div className="space-y-2">
                    {[...completed].reverse().slice(-8).map(c => {
                      const fl = c.focusLossCount || 0;
                      const barWidth = Math.min((fl / Math.max(...completed.map(x => x.focusLossCount || 0), 1)) * 100, 100);
                      return (
                        <div key={c.id} className="flex items-center gap-3 text-xs">
                          <span className="text-text-secondary truncate w-36 shrink-0">{c.title}</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${fl === 0 ? "bg-emerald-500/60" : fl <= 2 ? "bg-amber-500/60" : "bg-rose-500/60"}`}
                              style={{ width: fl === 0 ? "4px" : `${barWidth}%` }} />
                          </div>
                          <span className={`w-12 text-right font-semibold shrink-0 ${fl === 0 ? "text-emerald-400" : fl <= 2 ? "text-amber-400" : "text-rose-400"}`}>
                            {fl === 0 ? "Clean" : `${fl}×`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {activeTab === "history" && (
              <div className="space-y-3">
                {completed.map((sub, idx) => {
                  const p = pct(sub.totalScore, sub.totalPossibleScore);
                  return (
                    <div key={sub.id}
                      onClick={() => openDetail(sub.id)}
                      className="glass-card p-5 cursor-pointer hover:border-brand-500/40 transition-all hover:bg-white/[0.03] group">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        {/* Left: title + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs text-text-tertiary font-mono">#{completed.length - idx}</span>
                            <h3 className="text-base font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                              {sub.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-text-tertiary flex-wrap mb-3">
                            <span>📅 {new Date(sub.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                            <span>⏱ {formatElapsed(sub.elapsedSeconds || 0)}</span>
                            {sub.focusLossCount > 0 ? (
                              <span className="text-amber-400 font-semibold">⚠ {sub.focusLossCount} focus {sub.focusLossCount === 1 ? "loss" : "losses"}</span>
                            ) : (
                              <span className="text-emerald-400 font-semibold">✓ No focus losses</span>
                            )}
                          </div>

                          {/* Per-type breakdown chips */}
                          <div className="flex flex-wrap gap-2">
                            <TypeChip label="Quiz" score={sub.quizScore} total={sub.quizTotal}
                              color="bg-brand-500/10 border-brand-500/20 text-brand-400" />
                            <TypeChip label="Code" score={sub.codeScore} total={sub.codeTotal}
                              color="bg-amber-500/10 border-amber-500/20 text-amber-400" />
                            <TypeChip label="XPath" score={sub.xpathScore} total={sub.xpathTotal}
                              color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" />
                          </div>
                        </div>

                        {/* Right: total score */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <ScoreBadge score={sub.totalScore} total={sub.totalPossibleScore} />
                          {/* Mini ring indicator */}
                          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                            <div className="relative w-6 h-6">
                              <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
                                <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                                <circle cx="12" cy="12" r="9" fill="none"
                                  stroke={p >= 80 ? "#34d399" : p >= 50 ? "#fbbf24" : "#f87171"}
                                  strokeWidth="3"
                                  strokeDasharray={`${(p / 100) * 56.55} 56.55`}
                                  strokeLinecap="round" />
                              </svg>
                            </div>
                            <span className="opacity-60 group-hover:opacity-100 transition-opacity">View details →</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          <div className="relative w-full max-w-2xl h-full bg-bg-surface border-l border-border-strong flex flex-col shadow-2xl">

            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-border-strong flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{detailData?.submission.examTitle ?? "Exam Details"}</h2>
                {detailData && (
                  <p className="text-text-tertiary text-xs mt-1">
                    Submitted {new Date(detailData.submission.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    &nbsp;·&nbsp;{formatElapsed(detailData.submission.elapsedSeconds)}
                  </p>
                )}
              </div>
              <button onClick={() => setDetailOpen(false)} className="text-text-tertiary hover:text-white transition-colors mt-0.5 ml-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary bar */}
            {detailData && (
              <div className="px-6 py-3 border-b border-border-strong bg-bg-surface-elevated/30 flex items-center justify-between gap-4 shrink-0 flex-wrap">
                <div className="flex items-center gap-5">
                  <div>
                    <span className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Time Taken</span>
                    <span className="font-mono text-sm text-white">{formatElapsed(detailData.submission.elapsedSeconds)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Focus Losses</span>
                    <span className={`font-mono text-sm font-semibold ${detailData.submission.focusLossCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {detailData.submission.focusLossCount === 0 ? "None (Clean)" : `${detailData.submission.focusLossCount}×`}
                    </span>
                  </div>
                </div>
                <ScoreBadge score={detailData.submission.totalScore} total={detailData.submission.totalPossibleScore} />
              </div>
            )}

            {/* Per-question list */}
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
                  const qPct = q > 0 ? (s / q) * 100 : 0;
                  return (
                    <div key={d.questionId} className="border border-border-strong rounded-xl overflow-hidden">
                      {/* Question header */}
                      <div className="bg-bg-surface-elevated/50 px-4 py-3 flex items-start justify-between gap-4 border-b border-border-strong">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-text-tertiary">#{i + 1}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              d.questionType === "CODE" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : d.questionType === "XPATH" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
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
                          <div className={`inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${scoreBg(qPct)}`}>
                            {s.toFixed(1)}<span className="opacity-40 font-normal">/</span>{q.toFixed(1)}
                          </div>
                        </div>
                      </div>

                      {/* Answer body */}
                      <div className="bg-bg-base px-4 py-3 space-y-3">
                        {d.questionType === "XPATH" ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Your XPath / CSS Selector</div>
                            {d.studentXpath ? (
                              <pre className="font-mono text-xs text-emerald-300 bg-bg-base border border-emerald-500/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{d.studentXpath}</pre>
                            ) : (
                              <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No answer submitted</div>
                            )}
                          </div>
                        ) : d.questionType === "QUIZ" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Your Answer</div>
                              <div className="space-y-1.5">
                                {d.selectedTexts?.length > 0 ? d.selectedTexts.map((t, ti) => (
                                  <div key={ti} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                                    d.result === "PASS" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" : "bg-rose-500/5 border-rose-500/20 text-rose-300"
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.result === "PASS" ? "bg-emerald-400" : "bg-rose-400"}`} />
                                    {t}
                                  </div>
                                )) : (
                                  <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No answer selected</div>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Correct Answer</div>
                              <div className="space-y-1.5">
                                {d.correctTexts?.length > 0 ? d.correctTexts.map((t, ti) => (
                                  <div key={ti} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-emerald-300">
                                    <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {t}
                                  </div>
                                )) : <div className="text-xs text-text-tertiary italic px-3 py-2">—</div>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Your Submitted Code</div>
                            {d.sourceCode ? (
                              <ExpandableCode code={d.sourceCode} language={d.language} />
                            ) : (
                              <div className="text-xs text-text-tertiary italic px-3 py-2 bg-bg-surface border border-border-strong rounded-lg">No code submitted</div>
                            )}
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
