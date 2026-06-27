"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function CodingConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  const [questionId, setQuestionId] = useState("");
  const [timeLimit, setTimeLimit] = useState(1000);
  const [starterCode, setStarterCode] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [wrapperCode, setWrapperCode] = useState("");
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
          setStarterCode(firstQ.config?.starterCode || "");
          setTeacherCode(firstQ.config?.teacherCode || "");
          setWrapperCode(firstQ.config?.wrapperCode || "");
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
      setStarterCode(selectedQ.config?.starterCode || "");
      setTeacherCode(selectedQ.config?.teacherCode || "");
      setWrapperCode(selectedQ.config?.wrapperCode || "");
      setTestCases(
        selectedQ.testCases?.length > 0
          ? selectedQ.testCases
          : [{ inputData: "", outputData: "", isHidden: false }]
      );
    } else {
      setTimeLimit(1000);
      setStarterCode("");
      setTeacherCode("");
      setWrapperCode("");
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
          starterCode,
          teacherCode,
          wrapperCode,
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

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Time Limit (ms)</label>
              <input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                className="premium-input font-mono"
              />
              <p className="text-text-tertiary text-xs mt-1">Student code is killed if it exceeds this duration. Default: 1000ms.</p>
            </div>

            {/* Starter Code */}
            <div className="pt-6 border-t border-border-strong">
              <div className="mb-3">
                <h3 className="text-base font-bold text-white">Starter Code <span className="text-text-tertiary font-normal text-sm">(optional)</span></h3>
                <p className="text-text-tertiary text-xs mt-0.5">Pre-filled template shown to students when they open this question.</p>
              </div>
              <textarea
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                className="premium-input font-mono text-sm min-h-[120px] w-full"
                placeholder={"# Write your solution here\nimport sys\ndata = sys.stdin.read()\n\n# TODO: process data and print result"}
              />
            </div>

            {/* Teacher Reference Code */}
            <div className="pt-6 border-t border-border-strong">
              <div className="mb-3">
                <h3 className="text-base font-bold text-white">
                  Teacher Reference Code
                  <span className="text-text-tertiary font-normal text-sm ml-2">(optional — auto-generates expected output)</span>
                </h3>
                <p className="text-text-tertiary text-xs mt-0.5">
                  If provided, the system runs this code against each test case input at grading time to generate the expected output automatically.
                  Leave "Expected Output" fields in test cases blank when using this.
                </p>
              </div>
              <textarea
                value={teacherCode}
                onChange={(e) => setTeacherCode(e.target.value)}
                className="premium-input font-mono text-sm min-h-[150px] w-full"
                placeholder={"# Reference solution\nimport sys, json\norders = json.loads(sys.stdin.read())\n# ... compute and print result"}
              />
              {teacherCode.trim() && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                  </svg>
                  Reference code is active. Expected output in test cases below will be ignored during grading.
                </div>
              )}
            </div>

            {/* Wrapper Code */}
            <div className="pt-6 border-t border-border-strong">
              <div className="mb-3">
                <h3 className="text-base font-bold text-white">
                  Wrapper Code
                  <span className="text-text-tertiary font-normal text-sm ml-2">(optional — appended after student code)</span>
                </h3>
                <p className="text-text-tertiary text-xs mt-0.5">
                  Code appended to the student&apos;s submission before execution. Use this to call the student&apos;s function with stdin input and print the result. For example: <code className="bg-bg-surface-elevated px-1 rounded text-brand-400">const n = parseInt(require(&apos;fs&apos;).readFileSync(&apos;/dev/stdin&apos;,&apos;utf8&apos;).trim()); console.log(isEven(n));</code>
                </p>
              </div>
              <textarea
                value={wrapperCode}
                onChange={(e) => setWrapperCode(e.target.value)}
                className="premium-input font-mono text-sm min-h-[120px] w-full"
                placeholder={"// JavaScript example:\nconst input = require('fs').readFileSync('/dev/stdin','utf8').trim();\nconsole.log(isEven(parseInt(input)));\n\n# Python example:\nimport sys\nn = int(sys.stdin.read().strip())\nprint(is_even(n))"}
              />
              {wrapperCode.trim() && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                  </svg>
                  Wrapper code is active. It will be appended to student code before execution.
                </div>
              )}
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
