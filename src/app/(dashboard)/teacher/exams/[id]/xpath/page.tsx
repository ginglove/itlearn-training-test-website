"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function XPathConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);
  const showToast = useToast();

  const [questionsList, setQuestionsList] = useState<any[]>([]);
  const [questionId, setQuestionId] = useState("");
  const [targetType, setTargetType] = useState<"URL" | "HTML">("URL");
  const [targetPayload, setTargetPayload] = useState("");
  const [referenceXpath, setReferenceXpath] = useState("");
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-config`);
      if (res.ok) {
        const data = await res.json();
        setQuestionsList(data.questions ?? []);
        if (data.questions?.length > 0) {
          selectQuestion(data.questions[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch xpath questions:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const selectQuestion = (q: any) => {
    setQuestionId(q.id);
    setTargetType(q.config?.targetType ?? "URL");
    setTargetPayload(q.config?.targetPayload ?? "");
    setReferenceXpath(q.config?.referenceXpath ?? "");
    setVerifyResult(null);
  };

  const handleVerify = async () => {
    if (!targetPayload.trim() || !referenceXpath.trim()) {
      showToast("Fill in Target and Reference XPath before verifying.", "error");
      return;
    }
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, targetType, targetPayload, referenceXpath, verify: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setVerifyResult({ ok: true, message: data.message ?? "Verified successfully." });
      } else {
        setVerifyResult({ ok: false, message: data.message ?? "Verification failed." });
      }
    } catch {
      setVerifyResult({ ok: false, message: "Network error during verification." });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!questionId || !targetPayload.trim() || !referenceXpath.trim()) {
      showToast("All fields are required.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/xpath-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, targetType, targetPayload, referenceXpath, verify: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("XPath configuration saved.", "success");
        fetchQuestions();
      } else {
        showToast(data.message ?? "Failed to save configuration.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isFetching) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 border-b border-border-strong pb-6">
          <div className="flex items-center gap-2 text-text-tertiary text-sm mb-2">
            <button onClick={() => router.back()} className="hover:text-white transition-colors">Exam</button>
            <span>›</span>
            <span className="text-text-secondary">XPath Configuration</span>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            XPath Question Config
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            Set the target URL or HTML and define the reference XPath locator for each XPATH question.
          </p>
        </div>

        {questionsList.length === 0 ? (
          <div className="glass-card p-10 text-center text-text-tertiary">
            No XPATH questions found for this exam. Add questions of type XPATH first.
          </div>
        ) : (
          <div className="grid grid-cols-[260px,1fr] gap-6">
            {/* Question List */}
            <div className="glass-card p-4 h-fit">
              <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">Questions</h3>
              <div className="space-y-1">
                {questionsList.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => selectQuestion(q)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      questionId === q.id
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "text-text-secondary hover:bg-bg-surface-elevated hover:text-white"
                    }`}
                  >
                    <div className="font-medium truncate">{q.title}</div>
                    {q.config ? (
                      <div className="text-[10px] text-emerald-400 mt-0.5">Configured</div>
                    ) : (
                      <div className="text-[10px] text-amber-400 mt-0.5">Not configured</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Config Form */}
            <div className="glass-card p-6 space-y-6">
              {/* Target Type */}
              <div>
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-3">
                  Target Type
                </label>
                <div className="flex gap-3">
                  {(["URL", "HTML"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTargetType(t); setVerifyResult(null); }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        targetType === t
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                          : "bg-bg-surface border-border-strong text-text-secondary hover:border-text-tertiary"
                      }`}
                    >
                      {t === "URL" ? "🌐 URL" : "📄 Raw HTML"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Payload */}
              <div>
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-2">
                  {targetType === "URL" ? "Target URL" : "HTML Snippet"}
                </label>
                {targetType === "URL" ? (
                  <input
                    type="url"
                    value={targetPayload}
                    onChange={(e) => { setTargetPayload(e.target.value); setVerifyResult(null); }}
                    placeholder="https://example.com"
                    className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                ) : (
                  <textarea
                    value={targetPayload}
                    onChange={(e) => { setTargetPayload(e.target.value); setVerifyResult(null); }}
                    rows={8}
                    placeholder="<html><body>...</body></html>"
                    className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  />
                )}
              </div>

              {/* Reference XPath */}
              <div>
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-2">
                  Reference XPath (Correct Answer)
                </label>
                <input
                  type="text"
                  value={referenceXpath}
                  onChange={(e) => { setReferenceXpath(e.target.value); setVerifyResult(null); }}
                  placeholder='//div[@class="target"]'
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>

              {/* Verification Result */}
              {verifyResult && (
                <div className={`px-4 py-3 rounded-xl border text-sm ${
                  verifyResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                }`}>
                  {verifyResult.ok ? "✓ " : "✕ "}{verifyResult.message}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleVerify}
                  disabled={isVerifying || isSaving}
                  className="flex-1 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isVerifying ? "Verifying..." : "Verify Configuration"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isVerifying}
                  className="flex-1 premium-btn-primary py-2.5 text-sm"
                >
                  {isSaving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
