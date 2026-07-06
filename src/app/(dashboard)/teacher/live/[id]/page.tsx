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
    progress: number;
    finished: boolean;
  }[];
  currentQuestion: {
    id: string;
    title: string;
    content: string;
    options: { id: string; text: string; isCorrect: boolean }[];
  } | null;
  answerDistribution: Record<string, number>;
  answeredCount: number;
  questions: { id: string; title: string; correctAnswer: string }[];
  answers: { studentId: string; questionId: string; isCorrect: boolean; points: number }[];
}

const OPTION_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500", "bg-teal-500"];

export default function LiveHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<HostState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

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
  const answersByStudent = new Map<string, Map<string, { isCorrect: boolean; points: number }>>();
  for (const a of answers ?? []) {
    if (!answersByStudent.has(a.studentId)) answersByStudent.set(a.studentId, new Map());
    answersByStudent.get(a.studentId)!.set(a.questionId, { isCorrect: a.isCorrect, points: a.points });
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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-text-tertiary text-xs font-mono">
              Question {session.currentQuestionIndex + 1} / {session.totalQuestions}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-text-secondary text-xs font-mono">
                {answeredCount}/{participants.length} answered
              </span>
              <span
                className={`text-2xl font-black font-mono ${
                  session.remainingSeconds <= 5 ? "text-rose-400" : "text-white"
                }`}
              >
                {session.remainingSeconds}s
              </span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{currentQuestion.title}</h2>
          <p className="text-text-secondary text-sm mb-5 whitespace-pre-wrap">{currentQuestion.content}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentQuestion.options.map((o, i) => {
              const count = answerDistribution[o.id] ?? 0;
              const pct = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
              return (
                <div
                  key={o.id}
                  className={`rounded-xl border p-3 ${
                    o.isCorrect ? "border-emerald-500/50 bg-emerald-500/5" : "border-border-strong"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${OPTION_COLORS[i % OPTION_COLORS.length]}`} />
                    <span className="text-white text-sm flex-grow">{o.text}</span>
                    {o.isCorrect && <span className="text-emerald-400 text-xs font-mono">✓ correct</span>}
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
        </div>
      )}

      {/* Leaderboard / lobby list */}
      <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-4">
          {session.status === "ENDED"
            ? "🏆 Final Leaderboard"
            : session.status === "LOBBY"
              ? "Players in Lobby"
              : "Leaderboard"}
        </h2>
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="text-left text-text-secondary text-xs font-semibold py-2.5 pr-4 sticky left-0 bg-bg-surface">
                    Student
                  </th>
                  {questions.map((q, qi) => (
                    <th
                      key={q.id}
                      title={`${q.title} — answer: ${q.correctAnswer}`}
                      className="text-center text-text-tertiary text-xs font-mono font-semibold py-2.5 px-1.5"
                    >
                      Q{qi + 1}
                    </th>
                  ))}
                  {session.mode === "STUDENT" && (
                    <th className="text-center text-text-tertiary text-xs font-semibold py-2.5 px-3">
                      Progress
                    </th>
                  )}
                  <th className="text-right text-text-tertiary text-xs font-semibold py-2.5 pl-3">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-strong">
                {participants.map((p, i) => (
                  <tr key={p.studentId}>
                    <td className="py-2.5 pr-4 sticky left-0 bg-bg-surface">
                      <div className="flex items-center gap-3">
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
                        <div className="min-w-[8rem]">
                          <p className="text-white text-sm whitespace-nowrap">{p.fullName}</p>
                          <p className="text-text-tertiary text-xs font-mono">{p.username}</p>
                        </div>
                      </div>
                    </td>
                    {questions.map((q, qi) => {
                      const a = answersByStudent.get(p.studentId)?.get(q.id);
                      return (
                        <td key={q.id} className="text-center py-2.5 px-1.5">
                          {a ? (
                            <span
                              title={`Q${qi + 1}: ${q.title} — ${
                                a.isCorrect ? `correct, +${a.points}` : "wrong"
                              }`}
                              className={`inline-flex w-7 h-7 rounded-md items-center justify-center text-[11px] font-mono border ${
                                a.isCorrect
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                                  : "bg-rose-500/15 text-rose-400 border-rose-500/40"
                              }`}
                            >
                              {a.isCorrect ? "✓" : "✗"}
                            </span>
                          ) : (
                            <span
                              title={`Q${qi + 1}: ${q.title} — no answer`}
                              className="text-text-tertiary text-xs"
                            >
                              ·
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {session.mode === "STUDENT" && (
                      <td className="text-center py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[11px] font-mono whitespace-nowrap ${
                            p.finished
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-bg-surface-elevated text-text-secondary border-border-strong"
                          }`}
                        >
                          {p.finished
                            ? "Finished"
                            : `Q ${Math.min(p.progress + 1, session.totalQuestions)}/${session.totalQuestions}`}
                        </span>
                      </td>
                    )}
                    <td className="text-right py-2.5 pl-3">
                      <span className="text-brand-400 font-mono font-bold">{p.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Answer key */}
            <div className="mt-5 pt-4 border-t border-border-strong">
              <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                Answer Key
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {questions.map((q, qi) => (
                  <div key={q.id} className="flex items-baseline gap-2 text-xs">
                    <span className="text-text-tertiary font-mono shrink-0">Q{qi + 1}</span>
                    <span className="text-text-secondary truncate" title={q.title}>
                      {q.title}
                    </span>
                    <span className="text-emerald-400 font-semibold shrink-0 ml-auto text-right" title={q.correctAnswer}>
                      {q.correctAnswer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
