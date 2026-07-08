"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface HostState {
  session: {
    id: string;
    joinCode: string;
    status: "LOBBY" | "QUESTION" | "ENDED";
    mode: "TEACHER" | "STUDENT";
    showCorrectAnswer: boolean;
    currentQuestionIndex: number;
    questionSeconds: number;
    remainingSeconds: number;
    totalQuestions: number;
    examTitle: string;
  };
  participants: {
    studentId: string;
    fullName: string;
    username: string;
    score: number;
    totalTimeMs: number;
    progress: number;
    finished: boolean;
  }[];
  currentQuestion: {
    id: string;
    type: string;
    title: string;
    content: string;
    options: { id: string; text: string; isCorrect: boolean }[];
  } | null;
  answerDistribution: Record<string, number>;
  answeredCount: number;
  questions: { id: string; type: string; title: string; correctAnswer: string }[];
  answers: {
    studentId: string;
    questionId: string;
    isCorrect: boolean;
    points: number;
    timeTakenMs: number;
    answerText: string;
    textAnswer: string | null;
  }[];
}

const OPTION_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500", "bg-teal-500"];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, "0")}.${tenths}s`
    : `${seconds}.${tenths}s`;
}

export default function LiveHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<HostState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/live-sessions/${id}`);
    if (res.ok) setState(await res.json());
    else setError("Live session not found.");
  }, [id]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 2500);
    return () => clearInterval(interval);
  }, [fetchState]);

  const control = async (action: "start" | "next" | "end") => {
    setIsActing(true);
    try {
      await fetch(`/api/v1/teacher/live-sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      fetchState();
    } finally {
      setIsActing(false);
    }
  };

  if (error) return <div className="p-10 text-rose-400">{error}</div>;
  if (!state) return <div className="p-10 text-text-secondary">Loading live session…</div>;

  const { session, participants, currentQuestion, answerDistribution, answeredCount, questions, answers } = state;
  const isLast = session.currentQuestionIndex >= session.totalQuestions - 1;

  // studentId → questionId → answer, for the per-question leaderboard detail
  const answersByStudent = new Map<
    string,
    Map<string, { isCorrect: boolean; points: number; timeTakenMs: number; answerText: string }>
  >();
  for (const a of answers ?? []) {
    if (!answersByStudent.has(a.studentId)) answersByStudent.set(a.studentId, new Map());
    answersByStudent
      .get(a.studentId)!
      .set(a.questionId, { isCorrect: a.isCorrect, points: a.points, timeTakenMs: a.timeTakenMs, answerText: a.answerText });
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-white">Live Quiz</h1>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
            </span>
          </div>
          <p className="text-text-secondary text-sm mt-1">
            {session.examTitle} ·{" "}
            {session.mode === "STUDENT" ? "student-paced" : "teacher-led"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session.status === "LOBBY" && (
            <button
              onClick={() => control("start")}
              disabled={isActing || participants.length === 0}
              className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
            >
              Start Quiz
            </button>
          )}
          {session.status === "QUESTION" && session.mode === "TEACHER" && (
            <button
              onClick={() => control("next")}
              disabled={isActing}
              className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
            >
              {isLast ? "Finish Quiz" : "Next Question"}
            </button>
          )}
          {session.status !== "ENDED" && (
            <button
              onClick={() => control("end")}
              disabled={isActing}
              className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm transition-all"
            >
              End Session
            </button>
          )}
          {session.status === "ENDED" && (
            <button
              onClick={() => router.push("/teacher")}
              className="px-4 py-2.5 rounded-xl border border-border-strong text-text-secondary hover:text-white text-sm transition-all"
            >
              Back to Exams
            </button>
          )}
        </div>
      </div>

      {/* Join code banner */}
      {session.status !== "ENDED" && (
        <div className="bg-bg-surface border border-brand-500/30 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-text-tertiary text-xs font-mono uppercase tracking-widest mb-1">
              Join Code — students enter this at Join Live Quiz
            </p>
            <p className="text-4xl font-black font-mono text-brand-400 tracking-[0.3em]">
              {session.joinCode}
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white font-mono">{participants.length}</p>
            <p className="text-text-tertiary text-xs">joined</p>
          </div>
        </div>
      )}

      {/* Question view */}
      {session.status === "QUESTION" && currentQuestion && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 mb-6">
          {/* Countdown timer — large and prominent */}
          {session.mode === "TEACHER" && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-tertiary text-xs font-mono">
                  {answeredCount}/{participants.length} answered
                </span>
                <span
                  className={`text-4xl font-black font-mono tabular-nums ${
                    session.remainingSeconds <= 5 ? "text-rose-400 animate-pulse" : "text-white"
                  }`}
                >
                  {session.remainingSeconds}s
                </span>
              </div>
              <div className="w-full h-2 bg-bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    session.remainingSeconds <= 5 ? "bg-rose-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${(session.remainingSeconds / session.questionSeconds) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary text-xs font-mono">
                Question {session.currentQuestionIndex + 1} / {session.totalQuestions}
              </span>
              {currentQuestion.type !== "QUIZ" && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400 text-[10px] font-semibold uppercase">
                  {currentQuestion.type === "TEXT"
                    ? "Open-ended"
                    : currentQuestion.type === "XPATH"
                      ? "XPath / CSS"
                      : currentQuestion.type}
                </span>
              )}
            </div>
            {currentQuestion.type === "QUIZ" && (
              <button
                onClick={() => setRevealAnswers((v) => !v)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  revealAnswers
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "border border-border-strong text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {revealAnswers ? "Hide Answers" : "Reveal Answers"}
              </button>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{currentQuestion.title}</h2>
          <p className="text-text-secondary text-sm mb-5 whitespace-pre-wrap">{currentQuestion.content}</p>
          {currentQuestion.type === "QUIZ" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentQuestion.options.map((o, i) => {
                const count = answerDistribution[o.id] ?? 0;
                const pct = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
                const showCorrect = revealAnswers && o.isCorrect;
                return (
                  <div
                    key={o.id}
                    className={`rounded-xl border p-3 ${
                      showCorrect ? "border-emerald-500/50 bg-emerald-500/5" : "border-border-strong"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${OPTION_COLORS[i % OPTION_COLORS.length]}`} />
                      <span className="text-white text-sm flex-grow">{o.text}</span>
                      {showCorrect && <span className="text-emerald-400 text-xs font-mono">✓ correct</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-grow h-2 bg-bg-surface-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-text-tertiary text-xs font-mono w-10 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5 text-center">
              <p className="text-violet-400 text-sm font-semibold">
                {answeredCount} / {participants.length} submitted
              </p>
              <p className="text-text-tertiary text-xs mt-1">
                {currentQuestion.type === "TEXT"
                  ? "Students are writing their answers. Review after the session ends."
                  : currentQuestion.type === "XPATH"
                    ? "Students are writing selectors — answers are auto-graded against the test cases."
                    : "Students are working on this question."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard / lobby list */}
      <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">
            {session.status === "ENDED"
              ? "🏆 Final Leaderboard"
              : session.status === "LOBBY"
                ? "Players in Lobby"
                : "Leaderboard"}
          </h2>
          {session.status !== "LOBBY" && participants.length > 0 && (
            <button
              onClick={() => setShowDetails((v) => !v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                showDetails
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                  : "border border-border-strong text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {showDetails ? "Hide Details" : "Show Details"}
            </button>
          )}
        </div>
        {participants.length === 0 ? (
          <p className="text-text-secondary text-sm py-8 text-center">
            Waiting for students to join with the code above…
          </p>
        ) : session.status === "LOBBY" ? (
          <div className="divide-y divide-border-strong">
            {participants.map((p) => (
              <div key={p.studentId} className="flex items-center gap-4 py-2.5">
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm shrink-0 bg-bg-surface-elevated text-text-tertiary border border-border-strong">
                  •
                </span>
                <div className="flex-grow">
                  <p className="text-white text-sm">{p.fullName}</p>
                  <p className="text-text-tertiary text-xs font-mono">{p.username}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Compact leaderboard — always visible */}
            <div className="divide-y divide-border-strong">
              {participants.map((p, i) => (
                <div key={p.studentId} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm shrink-0 ${
                      i === 0
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : i === 1
                          ? "bg-slate-400/20 text-slate-300 border border-slate-400/40"
                          : i === 2
                            ? "bg-orange-700/20 text-orange-400 border border-orange-700/40"
                            : "bg-bg-surface-elevated text-text-tertiary border border-border-strong"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-grow min-w-0">
                    <p className="text-white text-sm">{p.fullName}</p>
                    <p className="text-text-tertiary text-xs font-mono">{p.username}</p>
                  </div>
                  {session.mode === "STUDENT" && (
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-mono whitespace-nowrap shrink-0 ${
                        p.finished
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-bg-surface-elevated text-text-secondary border-border-strong"
                      }`}
                    >
                      {p.finished
                        ? "Finished"
                        : `Q ${Math.min(p.progress + 1, session.totalQuestions)}/${session.totalQuestions}`}
                    </span>
                  )}
                  <span className="text-text-secondary font-mono text-xs shrink-0">{formatTime(p.totalTimeMs)}</span>
                  <span className="text-brand-400 font-mono font-bold shrink-0 w-14 text-right">{p.score}</span>
                </div>
              ))}
            </div>

            {/* Detailed per-question breakdown — collapsible */}
            {showDetails && (
              <div className="mt-5 pt-4 border-t border-border-strong">
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border-strong">
                        <th className="text-left text-text-secondary text-xs font-semibold py-2.5 pr-4 sticky left-0 bg-bg-surface z-10">
                          Student
                        </th>
                        {questions.map((q, qi) => (
                          <th
                            key={q.id}
                            title={`${q.title}${q.type === "QUIZ" ? ` — answer: ${q.correctAnswer}` : ""}`}
                            className="text-center text-text-tertiary text-xs font-mono font-semibold py-2.5 px-1.5"
                          >
                            Q{qi + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-strong">
                      {participants.map((p) => (
                        <tr key={p.studentId}>
                          <td className="py-2.5 pr-4 sticky left-0 bg-bg-surface z-10">
                            <p className="text-white text-sm whitespace-nowrap">{p.fullName}</p>
                          </td>
                          {questions.map((q, qi) => {
                            const a = answersByStudent.get(p.studentId)?.get(q.id);
                            return (
                              <td key={q.id} className="text-center py-2.5 px-1.5">
                                {a ? (
                                  q.type === "QUIZ" ? (
                                    <span
                                      title={`Q${qi + 1}: ${q.title}\nAnswered: ${a.answerText}\nCorrect answer: ${q.correctAnswer}\n${
                                        a.isCorrect ? `Correct, +${a.points}` : "Wrong"
                                      }\nTime: ${formatTime(a.timeTakenMs)}`}
                                      className={`inline-flex max-w-[7rem] h-7 rounded-md items-center justify-center gap-1 px-2 text-[11px] font-mono border ${
                                        a.isCorrect
                                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                                          : "bg-rose-500/15 text-rose-400 border-rose-500/40"
                                      }`}
                                    >
                                      <span className="shrink-0">{a.isCorrect ? "✓" : "✗"}</span>
                                      <span className="truncate">{a.answerText}</span>
                                    </span>
                                  ) : (
                                    <span
                                      title={`Q${qi + 1}: ${q.title}\nAnswer: ${a.answerText}\nTime: ${formatTime(a.timeTakenMs)}`}
                                      className="inline-flex max-w-[7rem] h-7 rounded-md items-center justify-center gap-1 px-2 text-[11px] font-mono border bg-violet-500/15 text-violet-400 border-violet-500/40"
                                    >
                                      <span className="shrink-0">✎</span>
                                      <span className="truncate">{a.answerText}</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="text-text-tertiary text-xs">·</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Answer key */}
                <div className="mt-4 pt-3 border-t border-border-strong">
                  <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                    Answer Key
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {questions.map((q, qi) => (
                      <div key={q.id} className="flex items-baseline gap-2 text-xs">
                        <span className="text-text-tertiary font-mono shrink-0">Q{qi + 1}</span>
                        {q.type !== "QUIZ" && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 text-[9px] font-semibold uppercase shrink-0">
                            {q.type === "TEXT" ? "Open" : q.type}
                          </span>
                        )}
                        <span className="text-text-secondary truncate" title={q.title}>
                          {q.title}
                        </span>
                        <span className={`font-semibold shrink-0 ml-auto text-right ${q.type === "QUIZ" ? "text-emerald-400" : "text-violet-400"}`} title={q.correctAnswer}>
                          {q.correctAnswer}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
