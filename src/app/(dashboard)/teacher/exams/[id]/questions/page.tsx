"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";

export default function ExamQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Question Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState({
    type: "QUIZ",
    title: "",
    content: "",
    points: 10,
    sortOrder: 0,
    options: [
      { optionText: "", isCorrect: false },
      { optionText: "", isCorrect: false },
    ],
    codeConfig: {
      timeLimit: 2000,
      memoryLimit: 128000,
      starterCode: "",
      teacherCode: "",
    },
    testCases: [
      { inputData: "", outputData: "", isHidden: false },
    ],
  });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleStartEdit = (q: any) => {
    setEditingQuestionId(q.id);
    setNewQuestion({
      type: q.type,
      title: q.title,
      content: q.content,
      points: parseFloat(q.points),
      sortOrder: q.sortOrder,
      options: q.type === "QUIZ" && q.options 
        ? q.options.map((opt: any) => ({ optionText: opt.optionText, isCorrect: opt.isCorrect }))
        : [
            { optionText: "", isCorrect: false },
            { optionText: "", isCorrect: false },
          ],
      codeConfig: q.type === "CODE" && q.config
        ? {
            timeLimit: q.config.timeLimit,
            memoryLimit: q.config.memoryLimit,
            starterCode: q.config.starterCode || "",
            teacherCode: q.config.teacherCode || "",
          }
        : {
            timeLimit: 2000,
            memoryLimit: 128000,
            starterCode: "",
            teacherCode: "",
          },
      testCases: q.type === "CODE" && q.testCases && q.testCases.length > 0
        ? q.testCases.map((tc: any) => ({ inputData: tc.inputData, outputData: tc.outputData, isHidden: tc.isHidden }))
        : [
            { inputData: "", outputData: "", isHidden: false },
          ],
    });
    setShowAddForm(true);
  };

  const fetchQuestions = async () => {
    try {
      setIsFetching(true);
      const res = await fetch(`/api/v1/teacher/exams/${examId}/questions`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/import-questions`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: `Successfully imported ${data.count} questions.` });
        fetchQuestions();
      } else {
        setMessage({ type: "error", text: data.message || "Failed to import questions." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error during upload." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // Validate quiz options
    if (newQuestion.type === "QUIZ") {
      const validOptions = newQuestion.options.filter(o => o.optionText.trim() !== "");
      if (validOptions.length < 2) {
        setMessage({ type: "error", text: "Quiz questions require at least two non-empty options." });
        setIsSaving(false);
        return;
      }
      const hasCorrect = validOptions.some(o => o.isCorrect);
      if (!hasCorrect) {
        setMessage({ type: "error", text: "At least one option must be marked as correct." });
        setIsSaving(false);
        return;
      }
    }

    try {
      const payload = {
        type: newQuestion.type,
        title: newQuestion.title,
        content: newQuestion.content,
        points: newQuestion.points,
        sortOrder: newQuestion.sortOrder,
        options: newQuestion.type === "QUIZ" ? newQuestion.options.filter(o => o.optionText.trim() !== "") : undefined,
        codeConfig: newQuestion.type === "CODE" ? newQuestion.codeConfig : undefined,
        testCases: newQuestion.type === "CODE" ? newQuestion.testCases.filter(tc => tc.outputData.trim() !== "") : undefined,
      };

      const url = editingQuestionId
        ? `/api/v1/teacher/exams/${examId}/questions/${editingQuestionId}`
        : `/api/v1/teacher/exams/${examId}/questions`;

      const method = editingQuestionId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage({ type: "success", text: editingQuestionId ? "Question updated successfully." : "Question created successfully." });
        setShowAddForm(false);
        setEditingQuestionId(null);
        // Reset form
        setNewQuestion({
          type: "QUIZ",
          title: "",
          content: "",
          points: 10,
          sortOrder: questions.length + 1,
          options: [
            { optionText: "", isCorrect: false },
            { optionText: "", isCorrect: false },
          ],
          codeConfig: {
            timeLimit: 2000,
            memoryLimit: 128000,
            starterCode: "",
            teacherCode: "",
          },
          testCases: [
            { inputData: "", outputData: "", isHidden: false },
          ],
        });
        fetchQuestions();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.message || "Failed to save question." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error occurred." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Are you sure you want to remove this question?")) return;

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/questions/${qId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Question removed successfully." });
        fetchQuestions();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.message || "Failed to delete question." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error." });
    }
  };

  // Form helpers
  const updateQuizOptionText = (index: number, val: string) => {
    const updatedOptions = [...newQuestion.options];
    updatedOptions[index].optionText = val;
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const updateQuizOptionCorrect = (index: number, val: boolean) => {
    const updatedOptions = [...newQuestion.options];
    updatedOptions[index].isCorrect = val;
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const addOptionField = () => {
    setNewQuestion({
      ...newQuestion,
      options: [...newQuestion.options, { optionText: "", isCorrect: false }]
    });
  };

  const removeOptionField = (index: number) => {
    if (newQuestion.options.length <= 2) return;
    setNewQuestion({
      ...newQuestion,
      options: newQuestion.options.filter((_, i) => i !== index)
    });
  };

  const updateTestCase = (index: number, field: string, val: any) => {
    const updatedCases = [...newQuestion.testCases];
    (updatedCases[index] as any)[field] = val;
    setNewQuestion({ ...newQuestion, testCases: updatedCases });
  };

  const addTestCaseField = () => {
    setNewQuestion({
      ...newQuestion,
      testCases: [...newQuestion.testCases, { inputData: "", outputData: "", isHidden: false }]
    });
  };

  const removeTestCaseField = (index: number) => {
    if (newQuestion.testCases.length <= 1) return;
    setNewQuestion({
      ...newQuestion,
      testCases: newQuestion.testCases.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
              <button onClick={() => router.push("/teacher")} className="hover:text-white transition-colors">Exams</button>
              <span>›</span>
              <span className="text-text-secondary">Manage Questions</span>
            </div>
            <h1 className="text-3xl font-bold text-white">Manage Questions</h1>
            <p className="text-text-secondary mt-1 text-sm">Add, edit, or delete questions for this exam.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => router.push(`/teacher/exams/${examId}/coding`)}
              className="premium-btn-secondary py-2 text-sm"
            >
              Coding Constraints
            </button>
            <button 
              onClick={() => {
                if (showAddForm) {
                  setEditingQuestionId(null);
                  setNewQuestion({
                    type: "QUIZ",
                    title: "",
                    content: "",
                    points: 10,
                    sortOrder: questions.length + 1,
                    options: [
                      { optionText: "", isCorrect: false },
                      { optionText: "", isCorrect: false },
                    ],
                    codeConfig: {
                      timeLimit: 2000,
                      memoryLimit: 128000,
                      starterCode: "",
                      teacherCode: "",
                    },
                    testCases: [
                      { inputData: "", outputData: "", isHidden: false },
                    ],
                  });
                }
                setShowAddForm(!showAddForm);
              }}
              className="premium-btn-primary py-2 text-sm"
            >
              {showAddForm ? "View Question List" : "+ Add Question"}
            </button>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl mb-6 ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {message.text}
          </div>
        )}

        {showAddForm ? (
          /* Question Builder Form */
          <div className="glass-card p-8 mb-8">
            <h3 className="text-xl font-bold text-white mb-6">{editingQuestionId ? "Edit Question" : "Create New Question"}</h3>
            <form onSubmit={handleAddQuestion} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Question Type</label>
                  <select
                    value={newQuestion.type}
                    onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                    className="premium-input bg-bg-surface-elevated text-white w-full border border-border-strong rounded-xl p-3 focus:outline-none focus:border-brand-500"
                  >
                    <option value="QUIZ">Quiz / Multiple Choice</option>
                    <option value="CODE">Coding Assessment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Variable Scope"
                    value={newQuestion.title}
                    onChange={(e) => setNewQuestion({ ...newQuestion, title: e.target.value })}
                    className="premium-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Points</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={newQuestion.points}
                      onChange={(e) => setNewQuestion({ ...newQuestion, points: parseFloat(e.target.value) })}
                      className="premium-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Order</label>
                    <input
                      type="number"
                      required
                      value={newQuestion.sortOrder}
                      onChange={(e) => setNewQuestion({ ...newQuestion, sortOrder: parseInt(e.target.value) })}
                      className="premium-input"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Question Text / Instruction</label>
                <textarea
                  required
                  placeholder="Describe the question details..."
                  value={newQuestion.content}
                  onChange={(e) => setNewQuestion({ ...newQuestion, content: e.target.value })}
                  className="premium-input min-h-[120px] resize-y"
                />
              </div>

              {/* Quiz Choices Section */}
              {newQuestion.type === "QUIZ" && (
                <div className="pt-4 border-t border-border-strong">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-bold text-white">Answer Options</h4>
                    <button
                      type="button"
                      onClick={addOptionField}
                      className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
                    >
                      + Add Option
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {newQuestion.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-4 bg-bg-surface p-3 border border-border-strong rounded-xl">
                        <input
                          type="checkbox"
                          checked={opt.isCorrect}
                          onChange={(e) => updateQuizOptionCorrect(i, e.target.checked)}
                          className="w-5 h-5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                          title="Mark as correct answer"
                        />
                        <input
                          type="text"
                          required
                          placeholder={`Option ${i + 1} text`}
                          value={opt.optionText}
                          onChange={(e) => updateQuizOptionText(i, e.target.value)}
                          className="premium-input py-1.5 flex-grow"
                        />
                        <button
                          type="button"
                          disabled={newQuestion.options.length <= 2}
                          onClick={() => removeOptionField(i)}
                          className="text-xs text-text-tertiary hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coding Constraints & Test Cases Section */}
              {newQuestion.type === "CODE" && (
                <div className="pt-4 border-t border-border-strong space-y-6">
                  <div>
                    <h4 className="text-md font-bold text-white mb-4">Coding Config (Defaults)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Time Limit (ms)</label>
                        <input
                          type="number"
                          value={newQuestion.codeConfig.timeLimit}
                          onChange={(e) => setNewQuestion({
                            ...newQuestion,
                            codeConfig: { ...newQuestion.codeConfig, timeLimit: parseInt(e.target.value) }
                          })}
                          className="premium-input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Memory Limit (KB)</label>
                        <input
                          type="number"
                          value={newQuestion.codeConfig.memoryLimit}
                          onChange={(e) => setNewQuestion({
                            ...newQuestion,
                            codeConfig: { ...newQuestion.codeConfig, memoryLimit: parseInt(e.target.value) }
                          })}
                          className="premium-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 mt-4">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Starter Code (Boilerplate loaded for students)</label>
                        <textarea
                          placeholder="// Write initial boilerplate code..."
                          value={newQuestion.codeConfig.starterCode}
                          onChange={(e) => setNewQuestion({
                            ...newQuestion,
                            codeConfig: { ...newQuestion.codeConfig, starterCode: e.target.value }
                          })}
                          className="premium-input font-mono text-sm min-h-[100px] resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Teacher Code (Reference solution compared with student output)</label>
                        <textarea
                          placeholder="// Write model solution code..."
                          value={newQuestion.codeConfig.teacherCode}
                          onChange={(e) => setNewQuestion({
                            ...newQuestion,
                            codeConfig: { ...newQuestion.codeConfig, teacherCode: e.target.value }
                          })}
                          className="premium-input font-mono text-sm min-h-[100px] resize-y"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border-strong">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-md font-bold text-white">Test Cases</h4>
                      <button
                        type="button"
                        onClick={addTestCaseField}
                        className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
                      >
                        + Add Test Case
                      </button>
                    </div>

                    <div className="space-y-4">
                      {newQuestion.testCases.map((tc, i) => (
                        <div key={i} className="bg-bg-surface-elevated rounded-xl p-4 border border-border-strong relative group">
                          <button 
                            type="button"
                            onClick={() => removeTestCaseField(i)}
                            disabled={newQuestion.testCases.length <= 1}
                            className="absolute top-4 right-4 text-xs text-text-tertiary hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                          >
                            Remove
                          </button>
                          
                          <div className="grid grid-cols-2 gap-4 mb-4 pr-12">
                            <div>
                              <label className="block text-xs font-medium text-text-tertiary mb-1">Standard Input</label>
                              <textarea
                                value={tc.inputData}
                                onChange={(e) => updateTestCase(i, "inputData", e.target.value)}
                                className="premium-input font-mono text-sm min-h-[60px]"
                                placeholder="e.g. 5"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-tertiary mb-1">Expected Output</label>
                              <textarea
                                required
                                value={tc.outputData}
                                onChange={(e) => updateTestCase(i, "outputData", e.target.value)}
                                className="premium-input font-mono text-sm min-h-[60px]"
                                placeholder="e.g. 10"
                              />
                            </div>
                          </div>
                          
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input
                              type="checkbox"
                              checked={tc.isHidden}
                              onChange={(e) => updateTestCase(i, "isHidden", e.target.checked)}
                              className="w-4 h-4 rounded border-border-strong bg-bg-base text-brand-500"
                            />
                            <span className="text-sm text-text-secondary">Hidden from student (evaluated on server)</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-border-strong flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingQuestionId(null);
                    setNewQuestion({
                      type: "QUIZ",
                      title: "",
                      content: "",
                      points: 10,
                      sortOrder: questions.length + 1,
                      options: [
                        { optionText: "", isCorrect: false },
                        { optionText: "", isCorrect: false },
                      ],
                      codeConfig: {
                        timeLimit: 2000,
                        memoryLimit: 128000,
                        starterCode: "",
                        teacherCode: "",
                      },
                      testCases: [
                        { inputData: "", outputData: "", isHidden: false },
                      ],
                    });
                  }}
                  className="premium-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="premium-btn-primary min-w-[140px]"
                >
                  {isSaving ? "Saving..." : editingQuestionId ? "Save Changes" : "Create Question"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Main view: Import & Questions list */
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Import box */}
              <div className="glass-card p-6 border-dashed border-2 border-border-strong hover:border-brand-500/50 transition-all flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-bg-surface-elevated rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h4 className="text-md font-bold text-white mb-1">Bulk Import</h4>
                <p className="text-text-tertiary text-xs mb-3">Upload spreadsheet file (.xlsx/csv)</p>
                <input 
                  type="file" 
                  accept=".xlsx,.csv"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="premium-btn-secondary py-1.5 px-4 text-xs w-full max-w-[150px]"
                >
                  {isUploading ? "Uploading..." : "Select File"}
                </button>
              </div>

              {/* Status statistics */}
              <div className="glass-card p-6 flex flex-col justify-center col-span-2">
                <h4 className="text-md font-bold text-white mb-3">Exam Structure</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-white">
                      {questions.length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">Total Questions</div>
                  </div>
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-brand-400">
                      {questions.filter(q => q.type === "QUIZ").length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">Quiz Questions</div>
                  </div>
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-blue-400">
                      {questions.filter(q => q.type === "CODE").length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">Coding Questions</div>
                  </div>
                </div>
              </div>
            </div>

            {/* List of Questions */}
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-6">Exam Question List</h3>
              
              {isFetching ? (
                <div className="text-center py-10">
                  <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
                </div>
              ) : questions.length === 0 ? (
                <div className="text-center py-10 text-text-tertiary">
                  No questions in this exam yet. Import a template or click "+ Add Question" to get started manually.
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="flex gap-4 p-5 rounded-xl bg-bg-surface hover:bg-bg-surface-elevated border border-border-strong relative group transition-all">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-bold text-text-tertiary font-mono">#{idx + 1}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            q.type === 'QUIZ' 
                              ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' 
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {q.type}
                          </span>
                          <span className="text-xs text-text-tertiary font-medium">{q.points} points</span>
                        </div>
                        <h4 className="text-md font-bold text-white mb-2">{q.title}</h4>
                        <p className="text-text-secondary text-sm line-clamp-3 mb-3">{q.content}</p>

                        {/* Additional info */}
                        {q.type === 'QUIZ' && q.options && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {q.options.map((opt: any, optIdx: number) => (
                              <span 
                                key={opt.id || optIdx}
                                className={`text-xs px-2.5 py-1 rounded-lg border ${
                                  opt.isCorrect 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold' 
                                    : 'bg-bg-base/30 text-text-tertiary border-border-strong'
                                }`}
                              >
                                {opt.optionText} {opt.isCorrect && "✓"}
                              </span>
                            ))}
                          </div>
                        )}

                        {q.type === 'CODE' && (
                          <div className="flex gap-4 text-xs text-text-tertiary mt-2 font-mono">
                            <span>Limit: {q.config?.timeLimit || 2000}ms / {q.config?.memoryLimit || 128000}KB</span>
                            <span>•</span>
                            <span>Test cases: {q.testCases?.length || 0} ({q.testCases?.filter((c: any) => c.isHidden).length || 0} hidden)</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleStartEdit(q)}
                          className="px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg text-xs font-semibold hover:bg-brand-500/20 transition-all opacity-0 group-hover:opacity-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold hover:bg-rose-500/20 transition-all opacity-0 group-hover:opacity-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
