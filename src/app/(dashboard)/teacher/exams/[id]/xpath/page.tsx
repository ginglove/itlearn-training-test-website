"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

type XpathTestCase = {
  id?: string;
  targetType: "URL" | "HTML";
  targetPayload: string;
  referenceSelector: string;
  isHidden: boolean;
  verifyResult?: { ok: boolean; matchedCount: number; message: string; snippets: string[] } | null;
  isVerifying?: boolean;
};

type XpathQuestion = {
  id: string;
  title: string;
  content: string;
  selectorType: "XPATH" | "CSS";
  testCases: XpathTestCase[];
  isConfigured: boolean;
};

export default function XPathConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  const showToast = useToast();

  const [questionsList, setQuestionsList] = useState<XpathQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectorType, setSelectorType] = useState<"XPATH" | "CSS">("XPATH");
  const [testCases, setTestCases] = useState<XpathTestCase[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchQuestions(); }, []);

  // keepId: after save, re-select the same question instead of jumping to Q1
  const fetchQuestions = async (keepId?: string) => {
    try {
      if (!keepId) setIsFetching(true); else setIsSyncing(true);
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-config`);
      if (res.ok) {
        const data = await res.json();
        const list: XpathQuestion[] = data.questions ?? [];
        setQuestionsList(list);
        if (list.length > 0) {
          const toSelect = keepId ? (list.find((q) => q.id === keepId) ?? list[0]) : list[0];
          selectQuestion(toSelect);
        }
      }
    } catch (err) {
      console.error("Failed to fetch xpath questions:", err);
    } finally {
      setIsFetching(false);
      setIsSyncing(false);
    }
  };

  const selectQuestion = (q: XpathQuestion) => {
    setSelectedId(q.id);
    setSelectorType((q.selectorType as "XPATH" | "CSS") ?? "XPATH");
    setTestCases(
      q.testCases.length > 0
        ? q.testCases.map((tc) => ({ ...tc, verifyResult: null, isVerifying: false }))
        : [emptyCase()]
    );
  };

  const emptyCase = (): XpathTestCase => ({
    targetType: "HTML",
    targetPayload: "",
    referenceSelector: "",
    isHidden: false,
    verifyResult: null,
    isVerifying: false,
  });

  const updateTC = (i: number, field: string, value: any) => {
    const updated = [...testCases];
    (updated[i] as any)[field] = value;
    if (field !== "verifyResult" && field !== "isVerifying") updated[i].verifyResult = null;
    setTestCases(updated);
  };

  const addTC = () => setTestCases([...testCases, emptyCase()]);

  const removeTC = (i: number) => {
    if (testCases.length <= 1) return;
    setTestCases(testCases.filter((_, idx) => idx !== i));
  };

  const handleVerify = async (i: number) => {
    const tc = testCases[i];
    if (!tc.targetPayload.trim() || !tc.referenceSelector.trim()) {
      showToast("Fill in target and reference selector before verifying.", "error");
      return;
    }
    updateTC(i, "isVerifying", true);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectorType, targetType: tc.targetType, targetPayload: tc.targetPayload, referenceSelector: tc.referenceSelector }),
      });
      const data = await res.json();
      const updated = [...testCases];
      updated[i].verifyResult = { ok: data.ok, matchedCount: data.matchedCount ?? 0, message: data.message ?? "", snippets: data.snippets ?? [] };
      updated[i].isVerifying = false;
      setTestCases(updated);
    } catch {
      const updated = [...testCases];
      updated[i].verifyResult = { ok: false, matchedCount: 0, message: "Network error.", snippets: [] };
      updated[i].isVerifying = false;
      setTestCases(updated);
    }
  };

  const handleSave = async () => {
    const valid = testCases.filter((tc) => tc.targetPayload.trim() && tc.referenceSelector.trim());
    if (!selectedId || valid.length === 0) {
      showToast("Add at least one test case with target and selector.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: selectedId,
          selectorType,
          testCases: valid.map(({ verifyResult: _vr, isVerifying: _iv, id: _id, ...tc }) => tc),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("XPath configuration saved.");
        fetchQuestions(selectedId);
      } else {
        showToast(data.message ?? "Failed to save.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const currentQ = questionsList.find((q) => q.id === selectedId);

  if (isFetching) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8 border-b border-border-strong pb-5">
          <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
            <button onClick={() => router.back()} className="hover:text-white transition-colors">Exam</button>
            <span>›</span>
            <span className="text-text-secondary">XPath Configuration</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                XPath / CSS Config
              </h1>
              <p className="text-text-secondary mt-1 text-sm">
                Set up test cases for each XPATH question — target HTML or URL, reference selector, and hidden flag.
              </p>
            </div>
            <button onClick={() => router.back()} className="premium-btn-secondary py-2 text-sm self-start">
              ← Back
            </button>
          </div>
          {/* Context-aware tip banner */}
          {selectorType === "XPATH" ? (
            <div className="mt-3 flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-2.5 text-xs text-amber-200/80">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>
                <strong className="text-amber-300">XPath mode:</strong>{" "}
                Only <strong className="text-white">XPath 1.0</strong> expressions are supported (e.g.{" "}
                <code className="font-mono bg-bg-surface px-1 rounded text-amber-300">//div[@class='price']</code>).{" "}
                Advanced functions like <code className="font-mono bg-bg-surface px-1 rounded text-amber-300">fn:matches()</code> are not available.{" "}
                If you need flexible class or attribute matching,{" "}
                <button
                  type="button"
                  onClick={() => { setSelectorType("CSS"); setTestCases((prev) => prev.map((tc) => ({ ...tc, verifyResult: null }))); }}
                  className="underline text-amber-300 hover:text-white transition-colors font-semibold"
                >
                  switch to CSS Selector
                </button>{" "}
                instead.
              </span>
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-4 py-2.5 text-xs text-emerald-200/80">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span>
                <strong className="text-emerald-300">CSS Selector mode:</strong>{" "}
                Students write standard CSS selectors (e.g.{" "}
                <code className="font-mono bg-bg-surface px-1 rounded text-emerald-300">div.price</code> or{" "}
                <code className="font-mono bg-bg-surface px-1 rounded text-emerald-300">ul &gt; li.active</code>).{" "}
                This is the recommended mode for matching elements by class or attribute.
              </span>
            </div>
          )}
        </div>

        {questionsList.length === 0 ? (
          <div className="glass-card p-10 text-center text-text-tertiary">
            No XPATH questions found for this exam. Add questions of type XPATH first.
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-[220px,1fr] gap-4 md:gap-6">
            {/* Question sidebar */}
            <div className="glass-card p-4 h-fit">
              <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">Questions</h3>
              <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
                {questionsList.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => selectQuestion(q)}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors shrink-0 md:shrink md:w-full ${
                      selectedId === q.id
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "text-text-secondary hover:bg-bg-surface-elevated hover:text-white border border-transparent"
                    }`}
                  >
                    <div className="font-medium truncate max-w-[160px] md:max-w-none">{q.title}</div>
                    <div className={`text-[10px] mt-0.5 ${q.isConfigured ? "text-emerald-400" : "text-amber-400"}`}>
                      {q.isConfigured ? `${q.testCases.length} test case(s)` : "Not configured"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Config form */}
            {currentQ && (
              <div className="glass-card p-4 md:p-6 space-y-6">
                {/* Question context header */}
                <div className="flex items-center justify-between pb-4 border-b border-border-strong">
                  <div className="min-w-0">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-bold mb-0.5">Configuring question</p>
                    <h2 className="text-base font-bold text-white truncate">{currentQ.title}</h2>
                  </div>
                  <span className={`shrink-0 ml-3 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                    currentQ.isConfigured
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  }`}>
                    {isSyncing ? "Saving…" : currentQ.isConfigured ? `${currentQ.testCases.length} case(s) saved` : "Not configured"}
                  </span>
                </div>

                {/* Selector type */}
                <div>
                  <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-2">Selector Type</label>
                  <div className="flex gap-3">
                    {(["XPATH", "CSS"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setSelectorType(t); setTestCases((prev) => prev.map((tc) => ({ ...tc, verifyResult: null }))); }}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                          selectorType === t
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                            : "bg-bg-surface border-border-strong text-text-secondary hover:border-text-tertiary"
                        }`}
                      >
                        {t === "XPATH" ? "XPath" : "CSS Selector"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-tertiary mt-2">
                    {selectorType === "XPATH" ? "Students write XPath 1.0 expressions e.g. //div[@class='price']" : "Students write CSS selectors e.g. div.price or ul > li.active"}
                  </p>
                </div>

                {/* Test cases */}
                <div className="border-t border-border-strong pt-5">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-bold text-white">Test Cases</h4>
                    <button type="button" onClick={addTC} className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold">+ Add Test Case</button>
                  </div>

                  <div className="space-y-4">
                    {testCases.map((tc, i) => (
                      <div key={i} className="bg-bg-surface-elevated rounded-xl p-4 border border-border-strong space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Case {i + 1}</span>
                          <button type="button" onClick={() => removeTC(i)} disabled={testCases.length <= 1} className="text-xs text-text-tertiary hover:text-rose-400 disabled:opacity-30">Remove</button>
                        </div>

                        {/* Target type toggle */}
                        <div className="flex gap-2">
                          {(["HTML", "URL"] as const).map((t) => (
                            <button key={t} type="button" onClick={() => updateTC(i, "targetType", t)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                tc.targetType === t
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                  : "bg-bg-surface border-border-strong text-text-secondary hover:border-text-tertiary"
                              }`}>
                              {t === "HTML" ? "📄 HTML Snippet" : "🌐 URL"}
                            </button>
                          ))}
                        </div>

                        {/* Target payload */}
                        <div>
                          <label className="block text-xs font-medium text-text-tertiary mb-1">
                            {tc.targetType === "URL" ? "Target URL" : "HTML Snippet"}
                          </label>
                          {tc.targetType === "URL" ? (
                            <input type="url" value={tc.targetPayload} onChange={(e) => updateTC(i, "targetPayload", e.target.value)}
                              placeholder="https://example.com"
                              className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50" />
                          ) : (
                            <textarea value={tc.targetPayload} onChange={(e) => updateTC(i, "targetPayload", e.target.value)} rows={5}
                              placeholder={"<html><body><div class=\"course-price\">$99</div></body></html>"}
                              className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50 resize-none" />
                          )}
                          {tc.targetType === "URL" && (
                            <p className="text-[10px] text-text-tertiary mt-1">Tip: jsdom loads static HTML only — JS is not executed. For JS-rendered pages, use HTML Snippet and paste rendered HTML from DevTools.</p>
                          )}
                        </div>

                        {/* Reference selector */}
                        <div>
                          <label className="block text-xs font-medium text-text-tertiary mb-1">
                            Reference {selectorType === "CSS" ? "CSS Selector" : "XPath"} (correct answer)
                          </label>
                          <input type="text" value={tc.referenceSelector} onChange={(e) => updateTC(i, "referenceSelector", e.target.value)}
                            placeholder={selectorType === "CSS" ? "div.course-price" : "//div[@class='course-price']"}
                            className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50" />
                        </div>

                        {/* Verify result */}
                        {tc.verifyResult && (
                          <div className={`px-3 py-2.5 rounded-lg text-xs border min-w-0 overflow-hidden ${tc.verifyResult.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                            {tc.verifyResult.ok ? `✓ ${tc.verifyResult.message}` : `✕ ${tc.verifyResult.message}`}
                            {tc.verifyResult.ok && tc.verifyResult.snippets.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {tc.verifyResult.snippets.slice(0, 2).map((s, si) => (
                                  <code key={si} className="block bg-emerald-900/20 rounded px-2 py-1 text-[10px] break-all whitespace-pre-wrap overflow-hidden w-full">{s}</code>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Hidden + Verify row */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tc.isHidden} onChange={(e) => updateTC(i, "isHidden", e.target.checked)}
                              className="w-4 h-4 rounded border-border-strong bg-bg-base text-emerald-500" />
                            <span className="text-xs text-text-secondary">Hidden (graded on submit only)</span>
                          </label>
                          <button type="button" onClick={() => handleVerify(i)}
                            disabled={tc.isVerifying || !tc.targetPayload.trim() || !tc.referenceSelector.trim()}
                            className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                            {tc.isVerifying ? "Verifying..." : "Verify"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <div className="pt-4 border-t border-border-strong">
                  <button onClick={handleSave} disabled={isSaving}
                    className="w-full premium-btn-primary py-2.5 text-sm">
                    {isSaving ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
