"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useToast, ConfirmModal } from "@/components/toast";

export default function ExamQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [examTitle, setExamTitle] = useState<string>("");
  const showToast = useToast();
  const [isFetching, setIsFetching] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
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
            starterCode: q.config.starterCode || "",
            teacherCode: q.config.teacherCode || "",
          }
        : {
            timeLimit: 2000,
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
        if (data.examTitle) setExamTitle(data.examTitle);
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

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/import-questions`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        showToast(`Successfully imported ${data.count} questions.`);
        fetchQuestions();
      } else {
        showToast(data.message || "Failed to import questions.", "error");
      }
    } catch (err) {
      showToast("Network error during upload.", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Validate quiz options
    if (newQuestion.type === "QUIZ") {
      const validOptions = newQuestion.options.filter(o => o.optionText.trim() !== "");
      if (validOptions.length < 2) {
        showToast("Quiz questions require at least two non-empty options.", "error");
        setIsSaving(false);
        return;
      }
      const hasCorrect = validOptions.some(o => o.isCorrect);
      if (!hasCorrect) {
        showToast("At least one option must be marked as correct.", "error");
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
        showToast(editingQuestionId ? "Question updated successfully." : "Question created successfully.");
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
        showToast(data.message || "Failed to save question.", "error");
      }
    } catch (err) {
      showToast("Network error occurred.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/questions/${qId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast("Question removed successfully.");
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(qId); return next; });
        fetchQuestions();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to delete question.", "error");
      }
    } catch (err) {
      showToast("Network error.", "error");
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/questions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: ids }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.deletedCount} question(s) removed.`);
        setSelectedIds(new Set());
        fetchQuestions();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to delete questions.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    }
  };

  const toggleSelect = (qId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId); else next.add(qId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
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
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
              <button onClick={() => router.push("/teacher")} className="hover:text-white transition-colors">Exams</button>
              <span>›</span>
              {examTitle && <><span className="text-text-secondary truncate max-w-[220px]" title={examTitle}>{examTitle}</span><span>›</span></>}
              <span className="text-text-secondary">Questions</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {examTitle || "Manage Questions"}
            </h1>
            <p className="text-text-secondary mt-1 text-sm">Add, edit, or delete questions for this exam.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => router.push("/teacher")}
              className="flex items-center gap-1.5 premium-btn-secondary py-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </button>
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/grading`)}
              className="premium-btn-secondary py-2 text-sm flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              Grading
            </button>
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/coding`)}
              className="premium-btn-secondary py-2 text-sm"
            >
              <span className="hidden sm:inline">Coding </span>Constraints
            </button>
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/xpath`)}
              className="premium-btn-secondary py-2 text-sm flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">XPath </span>Config
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
              {showAddForm ? "View List" : "+ Add Question"}
            </button>
          </div>
        </div>

        {showAddForm ? (
          /* Question Builder Form */
          <div className="glass-card p-4 md:p-8 mb-8">
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
                    <option value="TEXT">Open-ended / Text Answer</option>
                    <option value="CODE">Coding Assessment</option>
                    <option value="XPATH">XPath Automation</option>
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
                            className="absolute top-4 right-4 text-xs text-text-tertiary hover:text-rose-400 disabled:opacity-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            Remove
                          </button>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 pr-0 sm:pr-12">
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

              {/* Text Answer info section */}
              {newQuestion.type === "TEXT" && (
                <div className="pt-4 border-t border-border-strong">
                  <div className="flex items-start gap-3 bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3">
                    <span className="text-violet-400 mt-0.5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <p className="text-sm text-violet-300">
                      Students will type their answer in a text box. You will need to <strong>manually review and grade</strong> their responses after they submit the exam via the <strong>Grading</strong> page.
                    </p>
                  </div>
                </div>
              )}

              {/* XPath info section */}
              {newQuestion.type === "XPATH" && (
                <div className="pt-4 border-t border-border-strong">
                  <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                    <span className="text-emerald-400 mt-0.5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <p className="text-sm text-emerald-300">
                      After creating this question, go to <strong>XPath Config</strong> to set the target URL or HTML snippet and the reference XPath locator.
                    </p>
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
                <a
                  href="/api/v1/teacher/questions/template"
                  download="questions_template.xlsx"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Template
                </a>
              </div>

              {/* Status statistics */}
              <div className="glass-card p-6 flex flex-col justify-center md:col-span-2">
                <h4 className="text-md font-bold text-white mb-3">Exam Structure</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
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
                    <div className="text-xs text-text-tertiary mt-1">Quiz</div>
                  </div>
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-violet-400">
                      {questions.filter(q => q.type === "TEXT").length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">Open-ended</div>
                  </div>
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-amber-400">
                      {questions.filter(q => q.type === "CODE").length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">Coding</div>
                  </div>
                  <div className="bg-bg-surface-elevated/50 p-4 rounded-xl">
                    <div className="text-2xl font-extrabold text-emerald-400">
                      {questions.filter(q => q.type === "XPATH").length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">XPath</div>
                  </div>
                </div>
              </div>
            </div>

            {/* List of Questions */}
            <div className="glass-card p-4 md:p-8">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
                <h3 className="text-xl font-bold text-white">Exam Question List</h3>
                {questions.length > 0 && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={questions.length > 0 && selectedIds.size === questions.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-border-strong bg-bg-base text-brand-500 accent-brand-500"
                      />
                      <span className="text-xs text-text-secondary font-medium">Select All</span>
                    </label>
                    {selectedIds.size > 0 && (
                      <button
                        onClick={() => setShowBulkDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold hover:bg-rose-500/20 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove {selectedIds.size} selected
                      </button>
                    )}
                  </div>
                )}
              </div>
              
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
                    <div key={q.id} className={`flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl bg-bg-surface hover:bg-bg-surface-elevated border relative group transition-all ${selectedIds.has(q.id) ? 'border-brand-500/40 bg-brand-500/5' : 'border-border-strong'}`}>
                      {/* Selection checkbox */}
                      <div className="flex items-start pt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q.id)}
                          onChange={() => toggleSelect(q.id)}
                          className="w-4 h-4 rounded border-border-strong bg-bg-base text-brand-500 accent-brand-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-bold text-text-tertiary font-mono">#{idx + 1}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            q.type === 'QUIZ'
                              ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                              : q.type === 'TEXT'
                              ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                              : q.type === 'XPATH'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {q.type === 'TEXT' ? 'OPEN-ENDED' : q.type}
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
                            <span>Time limit: {q.config?.timeLimit || 2000}ms</span>
                            <span>•</span>
                            <span>Test cases: {q.testCases?.length || 0} ({q.testCases?.filter((c: any) => c.isHidden).length || 0} hidden)</span>
                          </div>
                        )}
                        {q.type === 'TEXT' && (
                          <div className="text-xs text-violet-400/70 mt-2">
                            Open-ended question — teacher grades manually after submission
                          </div>
                        )}
                        {q.type === 'XPATH' && (
                          <div className="text-xs text-emerald-400/70 mt-2 font-mono">
                            Configure target & reference XPath via <strong>XPath Config</strong>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleStartEdit(q)}
                          className="px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg text-xs font-semibold hover:bg-brand-500/20 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(q.id)}
                          className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold hover:bg-rose-500/20 transition-all"
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

      <ConfirmModal
        open={deleteTarget !== null}
        variant="danger"
        title="Remove Question"
        description="Are you sure you want to remove this question? All associated options and test cases will be permanently deleted."
        confirmLabel="Remove Question"
        cancelLabel="Keep Question"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { const id = deleteTarget!; setDeleteTarget(null); handleDeleteQuestion(id); }}
      />

      <ConfirmModal
        open={showBulkDeleteConfirm}
        variant="danger"
        title={`Remove ${selectedIds.size} Question${selectedIds.size === 1 ? '' : 's'}`}
        description={`Are you sure you want to remove ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'}? All associated options, test cases, and XPath configurations will be permanently deleted.`}
        confirmLabel={`Remove ${selectedIds.size} Question${selectedIds.size === 1 ? '' : 's'}`}
        cancelLabel="Cancel"
        onCancel={() => setShowBulkDeleteConfirm(false)}
        onConfirm={() => { setShowBulkDeleteConfirm(false); handleBulkDelete(); }}
      />
    </div>
  );
}
