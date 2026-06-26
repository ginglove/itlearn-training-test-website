"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function ExamWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [focusLosses, setFocusLosses] = useState(0);
  const [focusLossPolicy, setFocusLossPolicy] = useState("LOG_ONLY");
  const [showFocusWarning, setShowFocusWarning] = useState(false);
  const [focusWarningOffense, setFocusWarningOffense] = useState(0);
  const focusLossPolicyRef = useRef("LOG_ONLY");
  const [timeLeft, setTimeLeft] = useState(3600);
  const showToast = useToast();
  const [runResults, setRunResults] = useState<Record<string, any>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"cases" | "output">("cases");
  const [xpathResults, setXpathResults] = useState<Record<string, any>>({});
  const [isRunningXpath, setIsRunningXpath] = useState(false);
  const [showUntestedWarning, setShowUntestedWarning] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const submissionId = typeof window !== 'undefined' ? sessionStorage.getItem(`exam_${examId}_submission_id`) : null;

  // Reset active tab when question changes; keep results per-question
  useEffect(() => {
    setActiveTab("cases");
  }, [currentIndex]);

  // Fetch Questions
  useEffect(() => {
    if (!submissionId) {
      router.push("/student/exams");
      return;
    }

    const fetchQuestions = async () => {
      try {
        const [questionsRes, draftRes] = await Promise.all([
          fetch(`/api/v1/student/exams/${examId}/questions`),
          fetch(`/api/v1/student/exams/${examId}/draft`),
        ]);

        const questionsData = await questionsRes.json();
        const draftData = draftRes.ok ? await draftRes.json() : { answers: [] };

        if (questionsRes.ok) {
          setQuestions(questionsData.questions);
          if (questionsData.focusLossPolicy) { setFocusLossPolicy(questionsData.focusLossPolicy); focusLossPolicyRef.current = questionsData.focusLossPolicy; }

          // Build a map of saved draft answers keyed by questionId
          const draftMap: Record<string, any> = {};
          for (const d of draftData.answers || []) {
            draftMap[d.questionId] = d;
          }

          // Initialise answers from draft first, fall back to starter code / empty
          const initialAnswers: Record<string, any> = {};
          questionsData.questions.forEach((q: any) => {
            const saved = draftMap[q.id];
            if (q.type === "CODE") {
              initialAnswers[q.id] = {
                source_code: saved?.sourceCode ?? q.starterCode ?? "",
                language: saved?.language ?? "python",
              };
            } else if (q.type === "XPATH") {
              initialAnswers[q.id] = {
                student_xpath: saved?.studentXpath ?? "",
              };
            } else {
              initialAnswers[q.id] = {
                selected_options: saved?.selectedOptions ?? [],
              };
            }
          });
          setAnswers(initialAnswers);
        }

        // Compute remaining time from startAt + examDuration stored by the exams list page
        const startAt = sessionStorage.getItem(`exam_${examId}_start_at`);
        const durationMins = parseInt(sessionStorage.getItem(`exam_${examId}_duration`) || "60", 10);
        if (startAt) {
          const elapsed = Math.floor((Date.now() - new Date(startAt).getTime()) / 1000);
          const remaining = Math.max(0, durationMins * 60 - elapsed);
          setTimeLeft(remaining);
        } else {
          setTimeLeft(durationMins * 60);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
  }, [examId, submissionId, router]);

  // Load Platform Settings
  useEffect(() => {
    fetch("/api/v1/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "SUCCESS") {
          setSettings(data.settings);
        }
      })
      .catch((err) => console.error("Failed to load settings", err));
  }, []);

  // Anti-Cheat: Focus tracking
  useEffect(() => {
    if (settings && !settings.focusTrackingEnabled) return;


    const handleBlur = () => {
      setFocusLosses(prev => {
        const next = prev + 1;
        if (focusLossPolicyRef.current === "WARN_AND_LOCK") {
          if (next <= 2) {
            setFocusWarningOffense(next);
            setShowFocusWarning(true);
          }
          // 3rd offense handled by useEffect watching focusLosses
        }
        return next;
      });
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [settings]);

  // Auto-submit on 3rd focus loss when WARN_AND_LOCK policy is active
  useEffect(() => {
    if (focusLosses >= 3 && focusLossPolicy === "WARN_AND_LOCK") {
      const payloads = Object.entries(answers).map(([qId, ans]) => ({ question_id: qId, ...ans }));
      fetch(`/api/v1/student/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId, focus_loss_count: focusLosses, close_reason: "FOCUS_LOSS_THRESHOLD", answers: payloads }),
      }).finally(() => {
        sessionStorage.removeItem(`exam_${examId}_submission_id`);
        router.push("/student/exams");
      });
    }
  }, [focusLosses]);

  // Auto-Save Drafts
  useEffect(() => {
    if (questions.length === 0) return;

    const intervalSeconds = settings?.autoSaveInterval ?? 15;
    const interval = setInterval(async () => {
      const payloads = Object.entries(answers).map(([qId, ans]) => ({
        question_id: qId,
        ...ans
      }));

      try {
        await fetch(`/api/v1/student/exams/${examId}/auto-save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submissionId, unsynced_payloads: payloads })
        });
      } catch (err) {
        console.error("Auto-save failed");
      }
    }, intervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [answers, examId, submissionId, questions.length, settings]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleOptionToggle = (qId: string, optionId: string, isMultiple: boolean) => {
    setAnswers(prev => {
      const current = prev[qId]?.selected_options || [];
      let nextOptions;
      
      if (isMultiple) {
        nextOptions = current.includes(optionId) 
          ? current.filter((id: string) => id !== optionId)
          : [...current, optionId];
      } else {
        nextOptions = [optionId];
      }
      
      return { ...prev, [qId]: { selected_options: nextOptions } };
    });
  };

  const handleCodeChange = (qId: string, code: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: { ...prev[qId], source_code: code }
    }));
  };

  const handleRunCode = async (qId: string) => {
    const answer = answers[qId];
    if (!answer?.source_code?.trim()) return;

    setIsRunning(true);
    setRunResults(prev => ({ ...prev, [qId]: null }));
    setActiveTab("output");

    try {
      const res = await fetch(`/api/v1/student/exams/${examId}/run-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: qId,
          source_code: answer.source_code,
          language: answer.language || "python",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setRunResults(prev => ({ ...prev, [qId]: data.executionResult }));
      } else {
        setRunResults(prev => ({ ...prev, [qId]: { error: data.message || "Execution failed" } }));
      }
    } catch (err) {
      setRunResults(prev => ({ ...prev, [qId]: { error: "Network error. Could not run code." } }));
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunXPath = async (qId: string) => {
    const xpath = answers[qId]?.student_xpath?.trim();
    if (!xpath) return;
    setIsRunningXpath(true);
    setXpathResults((prev) => ({ ...prev, [qId]: null }));
    try {
      const res = await fetch(`/api/v1/student/exams/${examId}/run-xpath`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: qId, student_xpath: xpath }),
      });
      const data = await res.json();
      setXpathResults((prev) => ({ ...prev, [qId]: res.ok ? data.result : { status: "CE", message: data.message ?? "Error" } }));
    } catch {
      setXpathResults((prev) => ({ ...prev, [qId]: { status: "CE", message: "Network error." } }));
    } finally {
      setIsRunningXpath(false);
    }
  };

  const handleSubmitClick = () => {
    const untestedCode = questions.filter(
      (q) => q.type === "CODE" && !runResults[q.id]
    );
    if (untestedCode.length > 0) {
      setShowUntestedWarning(true);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setShowUntestedWarning(false);
    setIsSubmitting(true);
    try {
      const payloads = Object.entries(answers).map(([qId, ans]) => ({
        question_id: qId,
        ...ans
      }));

      const res = await fetch(`/api/v1/student/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          focus_loss_count: focusLosses,
          close_reason: null,
          answers: payloads
        })
      });

      if (res.ok) {
        sessionStorage.removeItem(`exam_${examId}_submission_id`);
        router.push("/student/exams");
      } else {
        showToast("Failed to submit exam. Please try again.", "error");
        setIsSubmitting(false);
      }
    } catch (err) {
      showToast("Network error. Drafts are saved, try again.", "error");
      setIsSubmitting(false);
    }
  };

  const handleSaveAndExit = async () => {
    setIsExiting(true);
    // Flush current answers to the server before leaving
    try {
      const payloads = Object.entries(answers).map(([qId, ans]) => ({
        question_id: qId,
        ...ans,
      }));
      await fetch(`/api/v1/student/exams/${examId}/auto-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId, unsynced_payloads: payloads }),
      });
      await fetch(`/api/v1/student/exams/${examId}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
    } catch {
      // Even on network error we navigate away — draft is auto-saved periodically
    }
    router.push("/student/exams");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const runResult = currentQ ? runResults[currentQ.id] ?? null : null;
  if (!currentQ) return null;

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen flex flex-col bg-bg-base overflow-hidden selection:bg-brand-500/30">
      {/* Top Navbar */}
      <header className="h-16 border-b border-border-strong bg-bg-surface flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-bg-surface-elevated border border-border-strong rounded-lg flex items-center justify-center overflow-hidden p-1 shrink-0">
            <img src="/Logo_2.png" alt="ITLearn Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-white font-medium text-sm">Exam Session</span>
        </div>

        <div className="flex items-center gap-6">
          <div className={`font-mono font-medium text-lg flex items-center gap-2 ${timeLeft < 300 ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatTime(timeLeft)}
          </div>
          
          <button
            onClick={handleSaveAndExit}
            disabled={isExiting || isSubmitting}
            className="premium-btn-secondary py-2 px-4 text-sm"
          >
            {isExiting ? "Saving..." : "Save & Exit"}
          </button>
          <button
            onClick={handleSubmitClick}
            disabled={isSubmitting || isExiting}
            className="premium-btn-primary py-2 px-6 text-sm"
          >
            {isSubmitting ? "Submitting..." : "Submit Exam"}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Question Nav */}
        <aside className="w-64 border-r border-border-strong bg-bg-surface-elevated/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-border-strong">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Questions Map</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const hasAnswer = q.type === "CODE"
                  ? !!answers[q.id]?.source_code?.trim()
                  : q.type === "XPATH"
                  ? !!answers[q.id]?.student_xpath?.trim()
                  : answers[q.id]?.selected_options?.length > 0;

                const activeColor = q.type === "CODE"
                  ? "bg-amber-500 text-white ring-2 ring-amber-500/50 ring-offset-2 ring-offset-bg-base"
                  : q.type === "XPATH"
                  ? "bg-emerald-500 text-white ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-bg-base"
                  : "bg-brand-500 text-white ring-2 ring-brand-500/50 ring-offset-2 ring-offset-bg-base";

                const answeredColor = q.type === "CODE"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                  : q.type === "XPATH"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                  : "bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30";

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-lg text-sm font-medium transition-all ${
                      isCurrent ? activeColor
                        : hasAnswer ? answeredColor
                        : "bg-bg-surface border border-border-strong text-text-secondary hover:border-text-tertiary"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Anti-Cheat Indicator */}
          {focusLosses > 0 && (
            <div className="p-4 border-t border-border-strong bg-rose-500/5">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Focus loss detected ({focusLosses})
              </div>
            </div>
          )}
        </aside>

        {/* Right Area: Question Content */}
        <main className="flex-1 overflow-y-auto p-4 relative">
          <div className="max-w-5xl mx-auto">

            {/* Question Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-1 block">
                  Question {currentIndex + 1} of {questions.length} • {currentQ.type}
                </span>
                <h2 className="text-sm text-white font-medium whitespace-pre-wrap leading-relaxed">{currentQ.content}</h2>
              </div>
              <div className="text-text-tertiary font-mono bg-bg-surface-elevated px-3 py-1 rounded text-sm whitespace-nowrap ml-4 shrink-0">
                {currentQ.points} pts
              </div>
            </div>

            {/* Response Area */}
            <div className="mt-3">
              {currentQ.type === "QUIZ" && currentQ.options ? (
                <div className="space-y-3">
                  {currentQ.options.map((opt: any) => {
                    const isSelected = answers[currentQ.id]?.selected_options?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleOptionToggle(currentQ.id, opt.id, currentQ.isMultipleChoice)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          isSelected 
                            ? 'bg-brand-500/10 border-brand-500 text-white' 
                            : 'bg-bg-surface border-border-strong text-text-secondary hover:border-text-tertiary hover:bg-bg-surface-elevated'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border ${
                            currentQ.isMultipleChoice ? 'rounded' : 'rounded-full'
                          } ${
                            isSelected ? 'border-brand-500 bg-brand-500' : 'border-text-tertiary'
                          }`}>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-base">{opt.optionText}</span>
                        </div>
                      </button>
                    );
                  })}
                  {currentQ.isMultipleChoice && (
                    <p className="text-xs text-text-tertiary mt-4">
                      * Select all that apply. Incorrect selections may result in point deductions.
                    </p>
                  )}
                </div>
              ) : currentQ.type === "XPATH" ? (
                /* ── Mode C: XPath Automation Workspace ── */
                <div className="border border-emerald-500/20 rounded-xl overflow-hidden shadow-2xl">
                  {/* Split pane */}
                  <div className="grid grid-cols-2 divide-x divide-emerald-500/10" style={{ minHeight: 360 }}>
                    {/* Left pane: target preview */}
                    <div className="flex flex-col bg-bg-surface-elevated/20">
                      <div className="px-4 py-2 border-b border-emerald-500/10 text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                        </svg>
                        Target Preview
                      </div>
                      <div className="flex-1 p-3">
                        {currentQ.targetType === "URL" && currentQ.targetPayload ? (
                          <iframe
                            src={currentQ.targetPayload}
                            sandbox="allow-same-origin"
                            className="w-full h-full rounded border border-border-strong bg-white"
                            style={{ minHeight: 300 }}
                            title="XPath target"
                          />
                        ) : currentQ.targetPayload ? (
                          <pre className="font-mono text-xs text-text-secondary bg-bg-base border border-border-strong rounded-lg p-3 overflow-auto h-full whitespace-pre-wrap">
                            {currentQ.targetPayload}
                          </pre>
                        ) : (
                          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
                            No target configured for this question.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right pane: question + xpath input */}
                    <div className="flex flex-col p-5 gap-5">
                      <div>
                        <h3 className="text-sm font-semibold text-text-secondary mb-1">Task</h3>
                        <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{currentQ.content}</p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Your XPath Locator
                        </label>
                        <input
                          type="text"
                          spellCheck={false}
                          value={answers[currentQ.id]?.student_xpath ?? ""}
                          onChange={(e) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [currentQ.id]: { student_xpath: e.target.value },
                            }))
                          }
                          placeholder='//div[@id="result"]'
                          className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                        <button
                          onClick={() => handleRunXPath(currentQ.id)}
                          disabled={isRunningXpath || !answers[currentQ.id]?.student_xpath?.trim()}
                          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                        >
                          {isRunningXpath ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Testing Locator...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              Test Locator
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Output console */}
                  {xpathResults[currentQ.id] !== undefined && (
                    <div className="border-t border-emerald-500/10 bg-bg-surface-elevated/30 p-4">
                      <div className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">Output Console</div>
                      {xpathResults[currentQ.id] === null ? (
                        <div className="flex items-center gap-2 text-text-secondary text-sm">
                          <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                          Evaluating XPath...
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border ${
                              xpathResults[currentQ.id].status === "AC"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : xpathResults[currentQ.id].status === "CE"
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            }`}>
                              {xpathResults[currentQ.id].status}
                            </span>
                            <span className="text-text-secondary text-sm">{xpathResults[currentQ.id].message}</span>
                          </div>
                          {xpathResults[currentQ.id].snippets?.length > 0 && (
                            <div>
                              <div className="text-xs text-text-tertiary mb-2">Matched elements (first 5):</div>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {xpathResults[currentQ.id].snippets.map((s: string, i: number) => (
                                  <pre key={i} className="font-mono text-xs text-emerald-300 bg-bg-base border border-emerald-500/10 rounded px-3 py-2 whitespace-pre-wrap break-all">
                                    {s}
                                  </pre>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : currentQ.type === "CODE" ? (
                <div className="border border-border-strong rounded-xl overflow-hidden flex flex-col h-[540px] shadow-2xl">
                  {/* Editor Header */}
                  <div className="bg-bg-surface-elevated px-4 py-2 flex items-center justify-between border-b border-border-strong shrink-0">
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-rose-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-amber-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-emerald-500/50"></div>
                      </div>
                      <span className="text-xs font-mono text-text-secondary">
                        {answers[currentQ.id]?.language === "javascript" ? "index.js" : "main.py"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <select 
                        value={answers[currentQ.id]?.language || "python"}
                        onChange={(e) => {
                          const lang = e.target.value;
                          setAnswers(prev => ({
                            ...prev,
                            [currentQ.id]: { ...prev[currentQ.id], language: lang }
                          }));
                        }}
                        className="bg-bg-base border border-border-strong rounded px-2 py-1 text-xs text-text-secondary font-mono focus:outline-none focus:border-brand-500 transition-colors"
                      >
                        <option value="python">Python 3</option>
                        <option value="javascript">JavaScript</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRunCode(currentQ.id)}
                        disabled={isRunning || !answers[currentQ.id]?.source_code?.trim()}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                      >
                        {isRunning ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                            Run Code
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Editor Body */}
                  <textarea
                    spellCheck={false}
                    className="flex-1 w-full bg-bg-surface text-text-primary p-4 font-mono text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar"
                    placeholder={
                      answers[currentQ.id]?.language === "javascript"
                        ? [
                            "// Read input from stdin",
                            "const fs = require('fs');",
                            "const input = fs.readFileSync('/dev/stdin', 'utf8').trim();",
                            "",
                            "// Parse and solve",
                            "// const data = JSON.parse(input);",
                            "",
                            "// Print your result",
                            "// console.log(result);",
                          ].join("\n")
                        : [
                            "# Read input from stdin",
                            "import sys",
                            "input_data = sys.stdin.read().strip()",
                            "",
                            "# Parse and solve",
                            "# import json",
                            "# data = json.loads(input_data)",
                            "",
                            "# Print your result",
                            "# print(result)",
                          ].join("\n")
                    }
                    value={answers[currentQ.id]?.source_code || ""}
                    onChange={(e) => handleCodeChange(currentQ.id, e.target.value)}
                  />
                  
                  {/* Tabbed Bottom Panel */}
                  <div className="h-72 border-t border-border-strong bg-bg-surface-elevated/50 flex flex-col shrink-0">
                    {/* Tab Header */}
                    <div className="px-4 py-2 border-b border-border-strong flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab("cases")}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          activeTab === "cases"
                            ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                            : "text-text-tertiary hover:text-text-secondary"
                        }`}
                      >
                        Sample Cases
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("output")}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                          activeTab === "output"
                            ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                            : "text-text-tertiary hover:text-text-secondary"
                        }`}
                      >
                        Execution Output
                        {runResult && !runResult.error && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            runResult.results?.every((r: any) => !r.actualOutput && !r.expectedOutput)
                              ? "bg-amber-500/20 text-amber-400"
                              : runResult.results?.every((r: any) => !r.expectedOutputConfigured)
                              ? "bg-amber-500/20 text-amber-400"
                              : runResult.overallStatus === "AC"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}>
                            {runResult.totalPassed}/{runResult.totalTestCases}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                      {activeTab === "cases" ? (
                        /* Sample Cases Tab */
                        currentQ.publicCases && currentQ.publicCases.length > 0 ? (
                          <div className="space-y-2">
                            {/* Stdin hint */}
                            <div className="flex items-center gap-2 text-[10px] text-text-tertiary bg-bg-surface border border-border-strong rounded-lg px-2.5 py-1.5">
                              <svg className="w-3 h-3 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span>
                                The <span className="text-white font-semibold">Input</span> below is passed as{" "}
                                <code className="font-mono text-brand-300">stdin</code> to your code when you click{" "}
                                <span className="text-white font-semibold">Run Code</span>.
                                Read it using{" "}
                                {answers[currentQ.id]?.language === "javascript"
                                  ? <><code className="font-mono text-amber-300">process.stdin</code> / <code className="font-mono text-amber-300">require(&apos;fs&apos;).readFileSync(&apos;/dev/stdin&apos;)</code></>
                                  : <><code className="font-mono text-amber-300">sys.stdin.read()</code> / <code className="font-mono text-amber-300">input()</code></>
                                }, then print your result.
                              </span>
                            </div>
                            {currentQ.publicCases.map((tc: any, i: number) => (
                              <div key={i} className="bg-bg-base border border-border-strong rounded-lg overflow-hidden">
                                <div className="px-3 py-1.5 border-b border-border-strong bg-bg-surface-elevated/40">
                                  <span className="text-xs font-semibold text-text-tertiary">Sample {i + 1}</span>
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-border-strong">
                                  <div className="p-3">
                                    <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5">Input (stdin)</div>
                                    <pre className="font-mono text-xs text-white whitespace-pre-wrap break-all leading-relaxed">{tc.inputData || "(empty)"}</pre>
                                  </div>
                                  <div className="p-3">
                                    <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5">Expected Output (stdout)</div>
                                    <pre className="font-mono text-xs text-brand-300 whitespace-pre-wrap break-all leading-relaxed">{tc.outputData || "(not configured)"}</pre>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-text-tertiary text-xs">No public sample test cases available for this question.</p>
                        )
                      ) : (
                        /* Execution Output Tab */
                        isRunning ? (
                          <div className="flex items-center gap-3 text-text-secondary text-sm">
                            <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                            Executing code against sample test cases...
                          </div>
                        ) : runResult ? (
                          runResult.error ? (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-lg">
                              {runResult.error}
                            </div>
                          ) : (
                            <>{(() => {
                              const results: any[] = runResult.results ?? [];
                              // A "vacuous pass" is when code ran but produced no output AND expected is also empty
                              const isVacuousPass =
                                runResult.overallStatus === "AC" &&
                                results.every((r: any) => !r.actualOutput && !r.expectedOutput);
                              const allUnconfigured = results.every((r: any) => !r.expectedOutputConfigured);
                              const studentNoOutput = results.every((r: any) => !r.actualOutput && !r.stderr);

                              // Derive a meaningful overall status label
                              const overallIsProblematic = isVacuousPass || allUnconfigured;
                              const statusLabel =
                                isVacuousPass ? "⚠ No Output Produced" :
                                allUnconfigured ? "⚠ Not Graded" :
                                runResult.overallStatus === "AC" ? "✓ All Passed" :
                                runResult.overallStatus === "CE" ? "⚠ Compile Error" :
                                runResult.overallStatus === "TLE" ? "⏱ Time Limit Exceeded" :
                                runResult.overallStatus === "RE" ? "✕ Runtime Error" :
                                "✕ Wrong Answer";
                              const statusClass =
                                overallIsProblematic ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                                runResult.overallStatus === "AC" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                                runResult.overallStatus === "CE" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                                "bg-rose-500/15 text-rose-400 border border-rose-500/30";

                              return (
                                <div className="space-y-3">
                                  {/* Overall status */}
                                  <div className="flex items-center gap-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${statusClass}`}>
                                      {statusLabel}
                                    </span>
                                    <span className="text-text-tertiary text-xs font-mono">
                                      {runResult.totalPassed}/{runResult.totalTestCases} passed
                                    </span>
                                  </div>

                                  {/* Contextual warnings */}
                                  {studentNoOutput && (
                                    <div className="flex items-start gap-2 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2.5 text-rose-300">
                                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                      </svg>
                                      <span>
                                        Your code ran but produced <strong>no output</strong>. Make sure you print your result using{" "}
                                        <code className="font-mono bg-rose-500/10 px-1 rounded">console.log()</code> (JavaScript) or{" "}
                                        <code className="font-mono bg-rose-500/10 px-1 rounded">print()</code> (Python).
                                      </span>
                                    </div>
                                  )}
                                  {allUnconfigured && !studentNoOutput && (
                                    <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                      </svg>
                                      <span>Expected output is not configured. This result does not reflect real grading. Contact your instructor.</span>
                                    </div>
                                  )}

                                  {/* Per-test-case results */}
                                  {results.map((r: any, i: number) => {
                                    const noOutput = !r.actualOutput && !r.stderr;
                                    const emptyExpected = r.expectedOutputConfigured && !r.expectedOutput;
                                    // Badge: amber when vacuous AC, otherwise normal
                                    const vacuous = r.status === "AC" && !r.actualOutput && !r.expectedOutput;
                                    const badgeClass = vacuous
                                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                      : r.status === "AC" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                      : r.status === "CE" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                      : "bg-rose-500/15 text-rose-400 border-rose-500/30";
                                    const badgeLabel = vacuous ? "?" : r.status;

                                    return (
                                      <div key={i} className="bg-bg-base border border-border-strong rounded-lg overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-border-strong bg-bg-surface-elevated/40">
                                          <span className="text-xs font-semibold text-text-secondary">Test Case {i + 1}</span>
                                          <div className="flex items-center gap-2">
                                            {r.executionTimeMs > 0 && (
                                              <span className="text-[10px] text-text-tertiary font-mono">{r.executionTimeMs}ms</span>
                                            )}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeClass}`}>
                                              {badgeLabel}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-3 divide-x divide-border-strong text-xs font-mono">
                                          {/* Input */}
                                          <div className="p-2.5">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">Input</div>
                                            <pre className="text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                                              {r.inputData || <span className="italic text-text-tertiary">(empty)</span>}
                                            </pre>
                                          </div>
                                          {/* Expected */}
                                          <div className="p-2.5">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">Expected</div>
                                            {!r.expectedOutputConfigured ? (
                                              <span className="text-amber-400/60 italic">not configured</span>
                                            ) : emptyExpected ? (
                                              <span className="text-amber-400/60 italic">(empty — check teacher config)</span>
                                            ) : (
                                              <pre className="text-brand-300 whitespace-pre-wrap break-all leading-relaxed">{r.expectedOutput}</pre>
                                            )}
                                          </div>
                                          {/* Your Output */}
                                          <div className="p-2.5">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">Your Output</div>
                                            {noOutput ? (
                                              <span className="text-rose-400/70 italic">no output — add print/console.log</span>
                                            ) : (
                                              <pre className={`whitespace-pre-wrap break-all leading-relaxed ${r.status === "AC" && !vacuous ? "text-emerald-400" : "text-rose-400"}`}>
                                                {r.actualOutput}
                                              </pre>
                                            )}
                                          </div>
                                        </div>
                                        {r.stderr && (
                                          <div className="border-t border-border-strong px-3 py-2">
                                            <div className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-1">Error</div>
                                            <pre className="text-amber-400/90 whitespace-pre-wrap font-mono text-[11px] bg-amber-500/5 rounded p-2 max-h-20 overflow-y-auto">{r.stderr}</pre>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}</>
                          )
                        ) : (
                          <p className="text-text-tertiary text-xs">Click &quot;Run Code&quot; to execute your solution against sample test cases.</p>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

          </div>
        </main>
      </div>
      
      {/* Focus Loss Warning Modal (WARN_AND_LOCK policy) */}
      {showFocusWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-bg-surface border border-rose-500/40 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Tab Switch Detected</h3>
                <p className="text-rose-400 text-sm mt-0.5">Warning {focusWarningOffense} of 2</p>
              </div>
            </div>
            <p className="text-text-secondary text-sm mb-2">
              You left the exam window. This event has been logged and reported to your instructor.
            </p>
            {focusWarningOffense >= 2 && (
              <p className="text-rose-400 text-sm font-semibold mb-2">
                ⚠ This is your final warning. A third tab switch will automatically submit your exam.
              </p>
            )}
            <button onClick={() => setShowFocusWarning(false)} className="w-full premium-btn-primary py-2.5 text-sm mt-2">
              I understand — return to exam
            </button>
          </div>
        </div>
      )}

      {/* Untested Code Warning Modal */}
      {showUntestedWarning && (() => {
        const untested = questions.map((q, idx) => ({ q, idx })).filter(({ q }) => q.type === "CODE" && !runResults[q.id]);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-surface border border-amber-500/30 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-base">Code Not Tested</h3>
                  <p className="text-amber-400 text-sm font-medium mt-0.5">
                    {untested.length} question{untested.length > 1 ? "s" : ""} haven&apos;t been run yet
                  </p>
                </div>
              </div>

              {/* Question list */}
              <div className="bg-bg-base rounded-xl border border-border-strong divide-y divide-border-strong mb-5 max-h-56 overflow-y-auto">
                {untested.map(({ q, idx }) => (
                  <div key={q.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-text-secondary text-sm leading-snug line-clamp-2">{q.content}</p>
                  </div>
                ))}
              </div>

              <p className="text-text-tertiary text-xs mb-5">
                Running your code lets you verify it works before submitting. You can still submit without testing, but untested code may not receive full marks.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowUntestedWarning(false)}
                  className="flex-1 premium-btn-secondary py-2.5 text-sm"
                >
                  Go Back &amp; Test
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 premium-btn-primary py-2.5 text-sm"
                >
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer Navigation */}
      <footer className="h-16 border-t border-border-strong bg-bg-surface flex items-center justify-between px-8 shrink-0">
        <button
          onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="premium-btn-secondary py-2 px-6"
        >
          Previous
        </button>
        <button
          onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
          disabled={currentIndex === questions.length - 1}
          className="premium-btn-secondary py-2 px-6"
        >
          Next
        </button>
      </footer>
    </div>
  );
}
