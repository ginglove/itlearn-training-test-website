"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";

interface AnswerResult {
  // null when the session hides correct answers
  isCorrect: boolean | null;
  points: number | null;
}

interface PlayState {
  session: {
    status: "LOBBY" | "QUESTION" | "ENDED";
    mode: "TEACHER" | "STUDENT";
    showCorrectAnswer: boolean;
    currentQuestionIndex: number;
    totalQuestions: number;
    remainingSeconds: number;
    questionSeconds: number;
    examTitle: string;
    participantCount: number;
  };
  currentQuestion: {
    id: string;
    type: string;
    title: string;
    content: string;
    options: { id: string; text: string }[];
  } | null;
  myAnswer: AnswerResult | null;
  finished: boolean;
  correctOptionIds: string[] | null;
  myBreakdown:
    | { title: string; type: string; answered: boolean; isCorrect: boolean; points: number }[]
    | null;
  myScore: number;
  myTotalTimeMs: number;
  myRank: number;
  leaderboard: { studentId: string; fullName: string; score: number; totalTimeMs: number }[];
}

const OPTION_COLORS = [
  "bg-rose-500 hover:bg-rose-400",
  "bg-sky-500 hover:bg-sky-400",
  "bg-amber-500 hover:bg-amber-400",
  "bg-emerald-500 hover:bg-emerald-400",
  "bg-purple-500 hover:bg-purple-400",
  "bg-teal-500 hover:bg-teal-400",
];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, "0")}.${tenths}s`
    : `${seconds}.${tenths}s`;
}

export default function LivePlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<PlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [isSubmittingText, setIsSubmittingText] = useState(false);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const lastQuestionId = useRef<string | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/v1/student/live-sessions/${id}`);
    if (res.ok) {
      const data: PlayState = await res.json();
      // Reset local selection when a new question opens
      if (data.currentQuestion && data.currentQuestion.id !== lastQuestionId.current) {
        lastQuestionId.current = data.currentQuestion.id;
        setSelected([]);
        setTextAnswer("");
        setFeedback(null);
      }
      setState(data);
    } else if (res.status === 403) {
      router.push("/student/live");
    } else {
      setError("Session not found.");
    }
  }, [id, router]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const submit = async (optionIds: string[]) => {
    if (!state?.currentQuestion) return;
    const res = await fetch(`/api/v1/student/live-sessions/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: state.currentQuestion.id, selectedOptions: optionIds }),
    });
    const data = await res.json();
    if (res.ok) {
      setFeedback({ isCorrect: data.isCorrect ?? null, points: data.points ?? null });
      fetchState();
    }
  };

  const submitText = async () => {
    if (!state?.currentQuestion || !textAnswer.trim()) return;
    setIsSubmittingText(true);
    try {
      const res = await fetch(`/api/v1/student/live-sessions/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: state.currentQuestion.id, textAnswer }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ isCorrect: data.isCorrect ?? null, points: data.points ?? null });
        fetchState();
      }
    } finally {
      setIsSubmittingText(false);
    }
  };

  const goNext = async () => {
    setIsAdvancing(true);
    try {
      await fetch(`/api/v1/student/live-sessions/${id}/next`, { method: "POST" });
      await fetchState();
    } finally {
      setIsAdvancing(false);
    }
  };

  if (error) return <div className="p-10 text-rose-400">{error}</div>;
  if (!state) return <div className="p-10 text-text-secondary">Connecting…</div>;

  const { session, currentQuestion, myAnswer, finished, myBreakdown, myScore, myTotalTimeMs, myRank, leaderboard } = state;
  const answered = !!myAnswer || !!feedback;
  const result = feedback ?? myAnswer;
  const selfPaced = session.mode === "STUDENT";
  const revealed = session.showCorrectAnswer && result?.isCorrect !== null;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      {/* Header: score + rank */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-white">{session.examTitle}</h1>
          <p className="text-text-tertiary text-xs font-mono mt-0.5">
            {session.participantCount} players
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-bg-surface border border-border-strong rounded-xl px-4 py-2 text-center">
            <p className="text-brand-400 font-mono font-bold text-lg leading-none">{myScore}</p>
            <p className="text-text-tertiary text-[10px] mt-1">POINTS</p>
          </div>
          <div className="bg-bg-surface border border-border-strong rounded-xl px-4 py-2 text-center">
            <p className="text-text-secondary font-mono font-bold text-lg leading-none">{formatTime(myTotalTimeMs)}</p>
            <p className="text-text-tertiary text-[10px] mt-1">TIME</p>
          </div>
          <div className="bg-bg-surface border border-border-strong rounded-xl px-4 py-2 text-center">
            <p className="text-white font-mono font-bold text-lg leading-none">#{myRank}</p>
            <p className="text-text-tertiary text-[10px] mt-1">RANK</p>
          </div>
        </div>
      </div>

      {session.status === "LOBBY" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-10 text-center">
          <div className="animate-pulse text-4xl mb-4">🎮</div>
          <h2 className="text-white font-bold text-lg mb-2">You&apos;re in!</h2>
          <p className="text-text-secondary text-sm">
            Waiting for your teacher to start the quiz…
          </p>
        </div>
      )}

      {session.status === "QUESTION" && finished && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">🏁</p>
          <h2 className="text-white font-bold text-lg mb-2">You finished!</h2>
          <p className="text-text-secondary text-sm">
            You answered all {session.totalQuestions} questions. The final leaderboard appears
            when your teacher ends the session.
          </p>
        </div>
      )}

      {session.status === "QUESTION" && !finished && currentQuestion && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-6">
          {/* Countdown timer */}
          {!selfPaced && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-tertiary text-xs font-mono">
                  Question {session.currentQuestionIndex + 1} / {session.totalQuestions}
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
          {selfPaced && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-text-tertiary text-xs font-mono">
                Question {session.currentQuestionIndex + 1} / {session.totalQuestions}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-white">{currentQuestion.title}</h2>
            {currentQuestion.type !== "QUIZ" && (
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400 text-[10px] font-semibold uppercase">
                {currentQuestion.type === "TEXT" ? "Open-ended" : currentQuestion.type}
              </span>
            )}
          </div>
          <p className="text-text-secondary text-sm mb-6 whitespace-pre-wrap">{currentQuestion.content}</p>

          {answered ? (
            <div
              className={`rounded-2xl p-8 text-center border ${
                !revealed
                  ? "border-border-strong"
                  : result?.isCorrect
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-rose-500/10 border-rose-500/30"
              }`}
            >
              {revealed ? (
                <>
                  <p className="text-4xl mb-2">{result?.isCorrect ? "🎉" : "😅"}</p>
                  <p className={`font-bold text-lg ${result?.isCorrect ? "text-emerald-400" : "text-rose-400"}`}>
                    {result?.isCorrect ? `Correct! +${result?.points} points` : "Not quite…"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl mb-2">✅</p>
                  <p className="font-bold text-lg text-white">Answer recorded</p>
                </>
              )}
              {selfPaced ? (
                <button
                  onClick={goNext}
                  disabled={isAdvancing}
                  className="mt-4 px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all"
                >
                  {session.currentQuestionIndex >= session.totalQuestions - 1
                    ? "Finish"
                    : "Next Question \u2192"}
                </button>
              ) : (
                <p className="text-text-secondary text-sm mt-1">Waiting for the next question…</p>
              )}
            </div>
          ) : !selfPaced && session.remainingSeconds === 0 ? (
            <div className="rounded-2xl p-8 text-center border border-border-strong">
              <p className="text-text-secondary">⏰ Time&apos;s up! Waiting for the next question…</p>
            </div>
          ) : currentQuestion.type === "TEXT" ? (
            <div className="space-y-3">
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                placeholder="Type your answer here…"
                rows={5}
                className="w-full bg-bg-surface-elevated border border-border-strong rounded-xl p-4 text-white text-sm placeholder:text-text-tertiary focus:border-brand-500 focus:outline-none resize-y"
              />
              <button
                onClick={submitText}
                disabled={isSubmittingText || !textAnswer.trim()}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all"
              >
                {isSubmittingText ? "Submitting…" : "Submit Answer"}
              </button>
            </div>
          ) : currentQuestion.type !== "QUIZ" ? (
            <div className="rounded-2xl p-8 text-center border border-border-strong">
              <p className="text-text-secondary text-sm">
                This question type ({currentQuestion.type}) is not supported in live quiz yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQuestion.options.map((o, i) => {
                const isPicked = selected.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      if (isPicked) {
                        submit(selected);
                      } else {
                        const next = [...selected, o.id];
                        setSelected(next);
                        if (selected.length === 0) submit([o.id]);
                      }
                    }}
                    className={`${OPTION_COLORS[i % OPTION_COLORS.length]} ${
                      isPicked ? "ring-4 ring-white/60" : ""
                    } text-white rounded-2xl p-5 font-semibold text-left text-sm transition-all shadow-lg`}
                  >
                    {o.text}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {session.status === "ENDED" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 text-center">
          <p className="text-5xl mb-3">🏆</p>
          <h2 className="text-white font-bold text-xl mb-1">Quiz Finished!</h2>
          <p className="text-text-secondary text-sm mb-6">
            You finished <span className="text-brand-400 font-bold">#{myRank}</span> with{" "}
            <span className="text-brand-400 font-bold">{myScore}</span> points.
          </p>
          <div className="divide-y divide-border-strong text-left max-w-md mx-auto">
            {leaderboard.map((p, i) => (
              <div key={p.studentId} className="flex items-center gap-3 py-2.5">
                <span className="w-7 text-center font-mono text-sm text-text-tertiary">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="text-white text-sm flex-grow">{p.fullName}</span>
                <span className="text-text-tertiary font-mono text-xs">{formatTime(p.totalTimeMs)}</span>
                <span className="text-brand-400 font-mono font-bold text-sm">{p.score}</span>
              </div>
            ))}
          </div>
          {myBreakdown && myBreakdown.length > 0 && (
            <div className="mt-8 text-left max-w-md mx-auto">
              <h3 className="text-white font-semibold text-sm mb-3">Your answers</h3>
              <div className="divide-y divide-border-strong">
                {myBreakdown.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-mono border shrink-0 ${
                        !q.answered
                          ? "border-border-strong text-text-tertiary"
                          : q.type !== "QUIZ"
                            ? "bg-violet-500/20 text-violet-400 border-violet-500/40"
                            : q.isCorrect
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                      }`}
                    >
                      {!q.answered ? "–" : q.type !== "QUIZ" ? "✎" : q.isCorrect ? "✓" : "✗"}
                    </span>
                    <span className="text-text-secondary text-sm flex-grow truncate">
                      {i + 1}. {q.title}
                    </span>
                    {q.type !== "QUIZ" && q.answered && (
                      <span className="text-violet-400 text-[10px] font-semibold shrink-0">
                        Submitted
                      </span>
                    )}
                    <span className="text-brand-400 font-mono text-xs shrink-0">
                      {q.answered ? (q.type === "QUIZ" ? `+${q.points}` : "pending") : "no answer"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => router.push("/student/exams")}
            className="mt-8 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
          >
            Back to Exams
          </button>
        </div>
      )}
    </div>
  );
}
