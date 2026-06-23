"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ExamWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusLosses, setFocusLosses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(3600); // Default 1hr
  const [runResult, setRunResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"cases" | "output">("cases");
  const [settings, setSettings] = useState<any>(null);
  const submissionId = typeof window !== 'undefined' ? sessionStorage.getItem(`exam_${examId}_submission_id`) : null;

  // Reset execution tab & results when active question changes
  useEffect(() => {
    setRunResult(null);
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
        const res = await fetch(`/api/v1/student/exams/${examId}/questions`);
        const data = await res.json();
        if (res.ok) {
          setQuestions(data.questions);
          // Initialize answer state
          const initialAnswers: Record<string, any> = {};
          data.questions.forEach((q: any) => {
            if (q.type === "CODE") {
              initialAnswers[q.id] = { source_code: q.starterCode || "", language: "python" };
            } else {
              initialAnswers[q.id] = { selected_options: [] };
            }
          });
          setAnswers(initialAnswers);
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
      setFocusLosses(prev => prev + 1);
      // In a real app, send a quick ping to backend to increment focus loss
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [settings]);

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
    setRunResult(null);
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
        setRunResult(data.executionResult);
      } else {
        setRunResult({ error: data.message || "Execution failed" });
      }
    } catch (err) {
      setRunResult({ error: "Network error. Could not run code." });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
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
          answers: payloads
        })
      });

      if (res.ok) {
        sessionStorage.removeItem(`exam_${examId}_submission_id`);
        router.push("/student/exams");
      } else {
        alert("Failed to submit exam. Please try again.");
        setIsSubmitting(false);
      }
    } catch (err) {
      alert("Network error. Drafts are saved, try again.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  const currentQ = questions[currentIndex];
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
            onClick={handleSubmit}
            disabled={isSubmitting}
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
                  : answers[q.id]?.selected_options?.length > 0;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-lg text-sm font-medium transition-all ${
                      isCurrent 
                        ? 'bg-brand-500 text-white ring-2 ring-brand-500/50 ring-offset-2 ring-offset-bg-base' 
                        : hasAnswer
                          ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30'
                          : 'bg-bg-surface border border-border-strong text-text-secondary hover:border-text-tertiary'
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
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-4xl mx-auto">
            
            {/* Question Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-2 block">
                  Question {currentIndex + 1} of {questions.length} • {currentQ.type}
                </span>
                <h2 className="text-xl text-white font-medium whitespace-pre-wrap">{currentQ.content}</h2>
              </div>
              <div className="text-text-tertiary font-mono bg-bg-surface-elevated px-3 py-1 rounded text-sm whitespace-nowrap ml-6">
                {currentQ.points} pts
              </div>
            </div>

            {/* Response Area */}
            <div className="mt-8">
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
              ) : currentQ.type === "CODE" ? (
                <div className="border border-border-strong rounded-xl overflow-hidden flex flex-col h-[600px] shadow-2xl">
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
                    className="flex-1 w-full bg-bg-surface text-text-primary p-6 font-mono text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar"
                    placeholder={
                      answers[currentQ.id]?.language === "javascript"
                        ? "// Write your JavaScript solution here..."
                        : "# Write your Python solution here..."
                    }
                    value={answers[currentQ.id]?.source_code || ""}
                    onChange={(e) => handleCodeChange(currentQ.id, e.target.value)}
                  />
                  
                  {/* Tabbed Bottom Panel */}
                  <div className="h-52 border-t border-border-strong bg-bg-surface-elevated/50 flex flex-col shrink-0">
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
                            runResult.overallStatus === "AC"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}>
                            {runResult.totalPassed}/{runResult.totalTestCases}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      {activeTab === "cases" ? (
                        /* Sample Cases Tab */
                        currentQ.publicCases && currentQ.publicCases.length > 0 ? (
                          <div className="flex gap-4">
                            {currentQ.publicCases.map((tc: any, i: number) => (
                              <div key={i} className="bg-bg-base border border-border-strong rounded-lg p-3 min-w-[250px]">
                                <div className="text-xs text-text-tertiary mb-1">Input:</div>
                                <div className="font-mono text-sm text-white mb-3 whitespace-pre-wrap">{tc.inputData || "(empty)"}</div>
                                <div className="text-xs text-text-tertiary mb-1">Expected Output:</div>
                                <div className="font-mono text-sm text-brand-300 whitespace-pre-wrap">{tc.outputData}</div>
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
                            <div className="space-y-3">
                              {/* Overall Status Badge */}
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  runResult.overallStatus === "AC" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                                  runResult.overallStatus === "CE" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                                  "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                }`}>
                                  {runResult.overallStatus === "AC" ? "✓ All Passed" :
                                   runResult.overallStatus === "CE" ? "⚠ Compile Error" :
                                   runResult.overallStatus === "TLE" ? "⏱ Time Limit Exceeded" :
                                   runResult.overallStatus === "RE" ? "✕ Runtime Error" :
                                   "✕ Wrong Answer"}
                                </span>
                                <span className="text-text-tertiary text-xs font-mono">
                                  {runResult.totalPassed}/{runResult.totalTestCases} passed
                                </span>
                              </div>
                              {/* Per-Test-Case Results */}
                              {runResult.results?.map((r: any, i: number) => (
                                <div key={i} className="bg-bg-base border border-border-strong rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-text-secondary">Test Case {i + 1}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      r.status === "AC" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                    }`}>
                                      {r.status}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                    <div>
                                      <div className="text-text-tertiary mb-0.5">Expected:</div>
                                      <div className="text-brand-300 whitespace-pre-wrap">{r.expectedOutput || "(empty)"}</div>
                                    </div>
                                    <div>
                                      <div className="text-text-tertiary mb-0.5">Actual:</div>
                                      <div className={`whitespace-pre-wrap ${r.status === "AC" ? "text-emerald-400" : "text-rose-400"}`}>{r.actualOutput || "(empty)"}</div>
                                    </div>
                                  </div>
                                  {r.stderr && (
                                    <div className="mt-2 text-xs">
                                      <div className="text-amber-400/70 mb-0.5">stderr:</div>
                                      <pre className="text-amber-400/90 whitespace-pre-wrap font-mono text-[11px] bg-amber-500/5 rounded p-2 max-h-24 overflow-y-auto">{r.stderr}</pre>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
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
