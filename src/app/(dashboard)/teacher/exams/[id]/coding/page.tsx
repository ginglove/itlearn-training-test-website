"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function CodingConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  const [questionId, setQuestionId] = useState("");
  const [timeLimit, setTimeLimit] = useState(1000);
  const [memoryLimit, setMemoryLimit] = useState(65536);
  const [testCases, setTestCases] = useState([{ inputData: "", outputData: "", isHidden: false }]);
  const [isLoading, setIsLoading] = useState(false);
  const showToast = useToast();
  const [isFetching, setIsFetching] = useState(true);
  const [questionsList, setQuestionsList] = useState<any[]>([]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/coding-config`);
      if (res.ok) {
        const data = await res.json();
        setQuestionsList(data.questions || []);
        if (data.questions && data.questions.length > 0) {
          // Auto-select first question
          const firstQ = data.questions[0];
          setQuestionId(firstQ.id);
          setTimeLimit(firstQ.config?.timeLimit || 1000);
          setMemoryLimit(firstQ.config?.memoryLimit || 65536);
          setTestCases(
            firstQ.testCases?.length > 0 
              ? firstQ.testCases 
              : [{ inputData: "", outputData: "", isHidden: false }]
          );
        }
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSelectQuestion = (qId: string) => {
    setQuestionId(qId);
    const selectedQ = questionsList.find(q => q.id === qId);
    if (selectedQ) {
      setTimeLimit(selectedQ.config?.timeLimit || 1000);
      setMemoryLimit(selectedQ.config?.memoryLimit || 65536);
      setTestCases(
        selectedQ.testCases?.length > 0 
          ? selectedQ.testCases 
          : [{ inputData: "", outputData: "", isHidden: false }]
      );
    } else {
      setTimeLimit(1000);
      setMemoryLimit(65536);
      setTestCases([{ inputData: "", outputData: "", isHidden: false }]);
    }
  };

  const handleAddTestCase = () => {
    setTestCases([...testCases, { inputData: "", outputData: "", isHidden: false }]);
  };

  const handleRemoveTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const handleTestCaseChange = (index: number, field: string, value: any) => {
    const newTestCases = [...testCases];
    (newTestCases[index] as any)[field] = value;
    setTestCases(newTestCases);
  };

  const handleSave = async () => {
    if (!questionId) {
      showToast("Please enter a valid Question ID", "error");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/coding-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          timeLimit,
          memoryLimit,
          testCases,
        }),
      });

      if (res.ok) {
        showToast("Coding configuration saved successfully.");
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to save configuration.", "error");
      }
    } catch (err) {
      showToast("Network error.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
            <button onClick={() => router.push("/teacher")} className="hover:text-white transition-colors">Exams</button>
            <span>›</span>
            <button onClick={() => router.push(`/teacher/exams/${examId}/questions`)} className="hover:text-white transition-colors">Questions</button>
            <span>›</span>
            <span className="text-text-secondary">Coding Config</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Coding Configuration</h1>
              <p className="text-text-secondary mt-1 text-sm">Set execution limits and manage test cases for code questions.</p>
            </div>
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/questions`)}
              className="flex items-center gap-1.5 premium-btn-secondary py-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Questions
            </button>
          </div>
        </div>

        <div className="glass-card p-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Select Coding Question</label>
              {isFetching ? (
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                  <span>Loading coding questions...</span>
                </div>
              ) : questionsList.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  ⚠️ No coding questions found in this exam. Please go back and import/add coding questions first.
                </div>
              ) : (
                <select
                  value={questionId}
                  onChange={(e) => handleSelectQuestion(e.target.value)}
                  className="premium-input bg-bg-surface-elevated text-white w-full border border-border-strong rounded-xl p-3 focus:outline-none focus:border-brand-500"
                >
                  {questionsList.map((q) => (
                    <option key={q.id} value={q.id} className="bg-bg-base">
                      {q.title || "Untitled Code Question"} ({q.points} pts) - {q.content.substring(0, 60)}...
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Time Limit (ms)</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                  className="premium-input font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Memory Limit (KB)</label>
                <input
                  type="number"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                  className="premium-input font-mono"
                />
              </div>
            </div>

            <div className="pt-8 border-t border-border-strong">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Test Cases</h3>
                <button 
                  onClick={handleAddTestCase}
                  className="premium-btn-secondary py-1.5 px-4 text-sm"
                >
                  + Add Test Case
                </button>
              </div>

              <div className="space-y-4">
                {testCases.map((tc, index) => (
                  <div key={index} className="bg-bg-surface-elevated rounded-xl p-4 border border-border-strong relative group">
                    <button 
                      onClick={() => handleRemoveTestCase(index)}
                      className="absolute top-4 right-4 text-text-tertiary hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4 pr-12">
                      <div>
                        <label className="block text-xs font-medium text-text-tertiary mb-1">Standard Input</label>
                        <textarea
                          value={tc.inputData}
                          onChange={(e) => handleTestCaseChange(index, "inputData", e.target.value)}
                          className="premium-input font-mono text-sm min-h-[80px]"
                          placeholder="e.g. 2 3"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-tertiary mb-1">Expected Output</label>
                        <textarea
                          value={tc.outputData}
                          onChange={(e) => handleTestCaseChange(index, "outputData", e.target.value)}
                          className="premium-input font-mono text-sm min-h-[80px]"
                          placeholder="e.g. 5"
                        />
                      </div>
                    </div>
                    
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={tc.isHidden}
                        onChange={(e) => handleTestCaseChange(index, "isHidden", e.target.checked)}
                        className="w-4 h-4 rounded border-border-strong bg-bg-base text-brand-500"
                      />
                      <span className="text-sm text-text-secondary">Hidden from student (evaluated on server)</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-border-strong flex justify-end">
              <button 
                onClick={handleSave}
                disabled={isLoading}
                className="premium-btn-primary min-w-[140px]"
              >
                {isLoading ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
