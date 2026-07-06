"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ExamOption {
  id: string;
  title: string;
  description: string | null;
}

export default function LiveLaunchPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [questionSeconds, setQuestionSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/teacher/exams");
        if (res.ok) {
          const data = await res.json();
          setExams(data.exams ?? []);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const launch = async () => {
    if (!selectedExamId) return;
    setIsLaunching(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/teacher/live-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, questionSeconds }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/teacher/live/${data.session.id}`);
      } else {
        setError(data.message || "Could not start the live session.");
        setIsLaunching(false);
      }
    } catch {
      setError("Network error. Try again.");
      setIsLaunching(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-display font-bold text-white">Host a Live Quiz</h1>
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
        </span>
      </div>
      <p className="text-text-secondary text-sm mb-8">
        Pick an exam with quiz questions. Students join with a code and answer together in real
        time, racing for the leaderboard.
      </p>

      {isLoading ? (
        <p className="text-text-secondary text-sm">Loading exams…</p>
      ) : exams.length === 0 ? (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-8 text-center">
          <p className="text-text-secondary text-sm">
            You have no exams yet. Create an exam with quiz questions first.
          </p>
          <button
            onClick={() => router.push("/teacher")}
            className="mt-4 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
          >
            Go to Manage Exams
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-6 max-h-[50vh] overflow-y-auto pr-1">
            {exams.map((exam) => (
              <button
                key={exam.id}
                onClick={() => setSelectedExamId(exam.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  selectedExamId === exam.id
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-border-strong bg-bg-surface hover:border-brand-500/40"
                }`}
              >
                <p className="text-white text-sm font-semibold">{exam.title}</p>
                {exam.description && (
                  <p className="text-text-tertiary text-xs mt-1 line-clamp-2">{exam.description}</p>
                )}
              </button>
            ))}
          </div>

          <div className="bg-bg-surface border border-border-strong rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-grow">
              <p className="text-white text-sm font-semibold">Time per question</p>
              <p className="text-text-tertiary text-xs mt-0.5">
                How long students have to answer each question.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[15, 30, 60, 120].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestionSeconds(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-mono font-semibold border transition-all ${
                    questionSeconds === s
                      ? "border-brand-500 bg-brand-500/10 text-brand-400"
                      : "border-border-strong text-text-secondary hover:text-white"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

          <button
            onClick={launch}
            disabled={!selectedExamId || isLaunching}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-brand-500/20"
          >
            {isLaunching ? "Starting…" : "Start Live Session"}
          </button>
        </>
      )}
    </div>
  );
}
