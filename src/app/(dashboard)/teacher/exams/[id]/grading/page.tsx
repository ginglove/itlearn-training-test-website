"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

interface TextQuestion {
  id: string;
  title: string;
  content: string;
  points: string;
  sortOrder: number;
}

interface Submission {
  submissionId: string;
  studentId: string;
  studentName: string;
  username: string;
  attempt: number;
  submittedAt: string;
  totalScore: string;
}

interface Answer {
  submissionId: string;
  questionId: string;
  textAnswer: string | null;
  score: string;
  gradedAt: string | null;
}

export default function GradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = use(params);
  const router = useRouter();
  const showToast = useToast();

  const [examTitle, setExamTitle] = useState("");
  const [questions, setQuestions] = useState<TextQuestion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gradingScores, setGradingScores] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/grading`);
      if (res.ok) {
        const data = await res.json();
        setExamTitle(data.examTitle || "");
        setQuestions(data.questions || []);
        setSubmissions(data.submissions || []);
        setAnswers(data.answers || []);
        const scores: Record<string, string> = {};
        for (const a of data.answers || []) {
          scores[`${a.submissionId}:${a.questionId}`] = a.score;
        }
        setGradingScores(scores);
      }
    } catch {
      showToast("Failed to load grading data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getAnswer = (submissionId: string, questionId: string): Answer | undefined =>
    answers.find((a) => a.submissionId === submissionId && a.questionId === questionId);

  const handleGrade = async (submissionId: string, questionId: string) => {
    const key = `${submissionId}:${questionId}`;
    const scoreStr = gradingScores[key];
    if (scoreStr === undefined || scoreStr === "") {
      showToast("Please enter a score.", "error");
      return;
    }
    const score = parseFloat(scoreStr);
    if (isNaN(score) || score < 0) {
      showToast("Score must be a non-negative number.", "error");
      return;
    }

    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/grading`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, questionId, score }),
      });
      if (res.ok) {
        showToast("Score saved successfully.");
        await fetchData();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to save score.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      setSavingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const ungradedCount = submissions.reduce((count, sub) => {
    return count + questions.filter((q) => {
      const a = getAnswer(sub.submissionId, q.id);
      return a && !a.gradedAt;
    }).length;
  }, 0);

  const totalAnswers = submissions.reduce((count, sub) => {
    return count + questions.filter((q) => getAnswer(sub.submissionId, q.id)).length;
  }, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
              <button onClick={() => router.push("/teacher")} className="hover:text-white transition-colors">Exams</button>
              <span>&rsaquo;</span>
              {examTitle && (
                <>
                  <span className="text-text-secondary truncate max-w-[220px]" title={examTitle}>{examTitle}</span>
                  <span>&rsaquo;</span>
                </>
              )}
              <span className="text-text-secondary">Grading</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Grade Open-ended Answers</h1>
            <p className="text-text-secondary mt-1 text-sm">Review and score student text answers.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/questions`)}
              className="flex items-center gap-1.5 premium-btn-secondary py-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Questions
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-5 text-center">
            <div className="text-2xl font-extrabold text-white">{questions.length}</div>
            <div className="text-xs text-text-tertiary mt-1">Open-ended Questions</div>
          </div>
          <div className="glass-card p-5 text-center">
            <div className="text-2xl font-extrabold text-white">{submissions.length}</div>
            <div className="text-xs text-text-tertiary mt-1">Submissions</div>
          </div>
          <div className="glass-card p-5 text-center">
            <div className={`text-2xl font-extrabold ${ungradedCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {totalAnswers - ungradedCount} / {totalAnswers}
            </div>
            <div className="text-xs text-text-tertiary mt-1">Graded</div>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-text-secondary">This exam has no open-ended questions.</p>
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/questions`)}
              className="mt-4 premium-btn-primary py-2 text-sm"
            >
              Add Questions
            </button>
          </div>
        ) : submissions.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-text-secondary">No students have submitted this exam yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {submissions.map((sub) => (
              <div key={sub.submissionId} className="glass-card overflow-hidden">
                {/* Student header */}
                <div className="px-5 py-4 border-b border-border-strong flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-white font-semibold">{sub.studentName}</h3>
                    <p className="text-text-tertiary text-xs font-mono">
                      @{sub.username} · Attempt #{sub.attempt} · Score: {sub.totalScore}
                    </p>
                  </div>
                  <div className="text-text-tertiary text-xs">
                    Submitted {new Date(sub.submittedAt).toLocaleString()}
                  </div>
                </div>

                {/* Answers */}
                <div className="divide-y divide-border-strong">
                  {questions.map((q) => {
                    const answer = getAnswer(sub.submissionId, q.id);
                    const key = `${sub.submissionId}:${q.id}`;
                    const isGraded = !!answer?.gradedAt;
                    const isSaving = savingKeys.has(key);
                    const maxPoints = parseFloat(q.points) || 0;

                    return (
                      <div key={q.id} className="p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                isGraded
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              }`}>
                                {isGraded ? "Graded" : "Pending"}
                              </span>
                              <span className="text-text-tertiary text-xs font-mono">{maxPoints} pts</span>
                            </div>
                            <h4 className="text-white font-semibold text-sm">{q.title}</h4>
                            <p className="text-text-secondary text-xs mt-0.5 whitespace-pre-wrap">{q.content}</p>
                          </div>
                        </div>

                        {answer?.textAnswer ? (
                          <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4 mb-3">
                            <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-2">Student&apos;s Answer</p>
                            <p className="text-white text-sm whitespace-pre-wrap">{answer.textAnswer}</p>
                          </div>
                        ) : (
                          <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4 mb-3 text-text-tertiary text-sm italic">
                            No answer provided
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-text-secondary font-medium">Score:</label>
                            <input
                              type="number"
                              min="0"
                              max={maxPoints}
                              step="0.5"
                              value={gradingScores[key] ?? "0"}
                              onChange={(e) => setGradingScores((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="premium-input w-20 py-1.5 text-center font-mono text-sm"
                            />
                            <span className="text-text-tertiary text-xs">/ {maxPoints}</span>
                          </div>
                          <button
                            onClick={() => handleGrade(sub.submissionId, q.id)}
                            disabled={isSaving}
                            className="premium-btn-primary py-1.5 px-4 text-xs"
                          >
                            {isSaving ? "Saving..." : isGraded ? "Update" : "Grade"}
                          </button>
                          {isGraded && (
                            <span className="text-emerald-400 text-xs flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Graded
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
