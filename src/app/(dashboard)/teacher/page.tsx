"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

const SESSION_TYPES = [
  { value: "ALL",      label: "All Types" },
  { value: "HOMEWORK", label: "Homework" },
  { value: "QUIZ",     label: "Quiz Session" },
  { value: "PRACTICE", label: "Practice" },
  { value: "FINAL",    label: "Final Exam" },
];

const SESSION_BADGE: Record<string, { label: string; className: string }> = {
  HOMEWORK: { label: "Homework",    className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  QUIZ:     { label: "Quiz Session",className: "bg-brand-500/15 text-brand-400 border-brand-500/30" },
  PRACTICE: { label: "Practice",    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  FINAL:    { label: "Final Exam",  className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

const PAGE_SIZE = 9;

export default function TeacherDashboard() {
  const router = useRouter();
  const showToast = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => { fetchExams(); }, []);
  useEffect(() => { setPage(1); }, [search, sessionFilter]);

  const fetchExams = async () => {
    try {
      const res = await fetch("/api/v1/teacher/exams", {
        headers: { "Authorization": `Bearer ${getCookie("session")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClone = async (examId: string) => {
    setCloningId(examId);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchExams();
        router.push(`/teacher/exams/${data.exam.id}/edit`);
      } else {
        showToast(data.message || "Failed to clone exam.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setCloningId(null);
    }
  };

  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift();
  };

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      const matchSession = sessionFilter === "ALL" || e.sessionType === sessionFilter;
      const matchSearch = !search.trim() ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.description || "").toLowerCase().includes(search.toLowerCase());
      return matchSession && matchSearch;
    });
  }, [exams, search, sessionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-bg-base p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Manage Exams</h1>
            <p className="text-text-secondary text-sm sm:text-base">Manage exams, questions, and monitor students.</p>
          </div>
          <button onClick={() => router.push("/teacher/exams/create")} className="premium-btn-primary shrink-0 text-sm sm:text-base">
            + Create New Exam
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search exams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="premium-input pl-9 w-full"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {SESSION_TYPES.map((st) => (
              <button
                key={st.value}
                onClick={() => setSessionFilter(st.value)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  sessionFilter === st.value
                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                    : "bg-bg-surface text-text-secondary border-border-strong hover:text-white"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        {!isLoading && (
          <p className="text-text-tertiary text-xs mb-4">
            {filtered.length} exam{filtered.length !== 1 ? "s" : ""} found
            {search || sessionFilter !== "ALL" ? " (filtered)" : ""}
          </p>
        )}

        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <h3 className="text-xl font-medium text-white mb-2">
              {exams.length === 0 ? "No Exams Yet" : "No Exams Match"}
            </h3>
            <p className="text-text-secondary mb-6">
              {exams.length === 0
                ? "Create your first exam to get started."
                : "Try adjusting the search or filter."}
            </p>
            {exams.length === 0 && (
              <button onClick={() => router.push("/teacher/exams/create")} className="premium-btn-secondary">
                Create Exam
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map((exam) => {
                const badge = SESSION_BADGE[exam.sessionType] || SESSION_BADGE["QUIZ"];
                return (
                  <div key={exam.id} className="glass-card p-6 flex flex-col h-full relative group">
                    {/* Session type badge */}
                    <div className="mb-3">
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-white pr-6 leading-tight">{exam.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleClone(exam.id)}
                          disabled={cloningId === exam.id}
                          className="text-text-tertiary hover:text-brand-400 transition-colors"
                          title="Clone Exam"
                        >
                          {cloningId === exam.id ? (
                            <div className="w-5 h-5 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => router.push(`/teacher/exams/${exam.id}/edit`)}
                          className="text-text-tertiary hover:text-white transition-colors"
                          title="Edit Settings"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <p className="text-text-secondary text-sm mb-4 line-clamp-2 flex-grow">
                      {exam.description || "No description provided."}
                    </p>

                    <div className="space-y-1.5 mb-6 text-xs text-text-tertiary">
                      <div className="flex justify-between">
                        <span>Duration</span>
                        <span className="text-text-primary font-medium">{exam.duration} mins</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Starts</span>
                        <span className="text-text-primary font-medium">{new Date(exam.startTime).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Access</span>
                        <span className={`font-medium ${exam.accessType === "RESTRICTED" ? "text-amber-400" : "text-emerald-400"}`}>
                          {exam.accessType === "RESTRICTED" ? "Restricted" : "All Students"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      <button
                        onClick={() => router.push(`/teacher/exams/${exam.id}/questions`)}
                        className="premium-btn-secondary py-2 text-sm"
                      >
                        Questions
                      </button>
                      <button
                        onClick={() => router.push(`/teacher/exams/${exam.id}/monitor`)}
                        className="premium-btn-primary py-2 text-sm"
                      >
                        Monitor
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm border border-border-strong text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                      p === page
                        ? "bg-brand-500 text-white"
                        : "border border-border-strong text-text-secondary hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm border border-border-strong text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
