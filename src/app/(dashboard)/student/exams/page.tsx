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

export default function StudentExamsPage() {
  const router = useRouter();
  const showToast = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => { fetchExams(); }, []);
  useEffect(() => { setPage(1); }, [search, sessionFilter, statusFilter]);

  const fetchExams = async () => {
    try {
      const res = await fetch("/api/v1/student/exams", {
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

  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift();
  };

  const startExam = async (examId: string) => {
    try {
      const res = await fetch(`/api/v1/student/exams/${examId}/start`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem(`exam_${examId}_submission_id`, data.submissionId);
        sessionStorage.setItem(`exam_${examId}_start_at`, data.startAt);
        sessionStorage.setItem(`exam_${examId}_duration`, String(data.examDuration));
        router.push(`/student/exams/${examId}/workspace`);
      } else {
        showToast(data.message || "Failed to start exam", "error");
      }
    } catch {
      showToast("Network error. Could not connect to exam server.", "error");
    }
  };

  const getExamStatus = (exam: any) => {
    if (exam.activeAttemptCancelled) return "CANCELLED";      // close date passed, unsubmitted attempt
    if (exam.activeAttemptPaused) return "PENDING";           // saved & exited, not yet expired
    if (exam.hasActiveAttempt) return "IN_PROGRESS";          // actively in exam
    if (exam.attemptsCount >= exam.allowedAttempts) return "COMPLETED";
    if (exam.isActive) return "ACTIVE";
    return "UPCOMING";
  };

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      const matchSession = sessionFilter === "ALL" || e.sessionType === sessionFilter;
      const matchSearch = !search.trim() ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.description || "").toLowerCase().includes(search.toLowerCase());
      const status = getExamStatus(e);
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && status === "ACTIVE") ||
        (statusFilter === "IN_PROGRESS" && status === "IN_PROGRESS") ||
        (statusFilter === "PENDING" && status === "PENDING") ||
        (statusFilter === "CANCELLED" && status === "CANCELLED") ||
        (statusFilter === "UPCOMING" && status === "UPCOMING") ||
        (statusFilter === "COMPLETED" && status === "COMPLETED");
      return matchSession && matchSearch && matchStatus;
    });
  }, [exams, search, sessionFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-bg-base p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">My Assessments</h1>
          <p className="text-text-secondary text-sm sm:text-base">View and access your available exams.</p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="relative">
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
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-text-tertiary mr-1">Type:</span>
            {SESSION_TYPES.map((st) => (
              <button
                key={st.value}
                onClick={() => setSessionFilter(st.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  sessionFilter === st.value
                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                    : "bg-bg-surface text-text-secondary border-border-strong hover:text-white"
                }`}
              >
                {st.label}
              </button>
            ))}
            <span className="text-xs text-text-tertiary ml-3 mr-1">Status:</span>
            {[
              { value: "ALL", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "PENDING", label: "Pending" },
              { value: "UPCOMING", label: "Upcoming" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  statusFilter === s.value
                    ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                    : "bg-bg-surface text-text-secondary border-border-strong hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {!isLoading && (
          <p className="text-text-tertiary text-xs mb-4">
            {filtered.length} exam{filtered.length !== 1 ? "s" : ""} found
            {search || sessionFilter !== "ALL" || statusFilter !== "ALL" ? " (filtered)" : ""}
          </p>
        )}

        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <h3 className="text-xl font-medium text-white mb-2">
              {exams.length === 0 ? "No Exams Available" : "No Exams Match"}
            </h3>
            <p className="text-text-secondary">
              {exams.length === 0
                ? "You currently have no assigned exams."
                : "Try adjusting the search or filter."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map((exam) => {
                const badge = SESSION_BADGE[exam.sessionType] || SESSION_BADGE["QUIZ"];
                const status = getExamStatus(exam);
                return (
                  <div key={exam.id} className="glass-card p-6 flex flex-col h-full border border-border-strong relative overflow-hidden">
                    {/* Top row: session type badge + status pill */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.className}`}>
                        {badge.label}
                      </span>
                      {status === "CANCELLED" ? (
                        <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">Cancelled by System</span>
                      ) : status === "PENDING" ? (
                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">Pending</span>
                      ) : status === "IN_PROGRESS" ? (
                        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full animate-pulse">In Progress</span>
                      ) : status === "COMPLETED" ? (
                        <span className="text-xs font-bold text-text-tertiary bg-bg-surface-elevated px-2.5 py-0.5 rounded-full">Completed</span>
                      ) : status === "ACTIVE" ? (
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">Active</span>
                      ) : (
                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">Upcoming</span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2 leading-tight">{exam.title}</h3>
                    <p className="text-text-secondary text-sm mb-5 flex-grow line-clamp-2">
                      {exam.description || "No description provided."}
                    </p>

                    <div className="bg-bg-surface-elevated/50 rounded-xl p-3 mb-5 space-y-2 text-xs text-text-tertiary">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Duration
                        </span>
                        <span className="text-white font-medium">{exam.duration} mins</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Closes
                        </span>
                        <span className="text-white font-medium">{new Date(exam.endTime).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-border-strong/50">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Attempts
                        </span>
                        <span className="text-white font-medium">{exam.attemptsCount} / {exam.allowedAttempts}</span>
                      </div>
                    </div>

                    {status === "CANCELLED" ? (
                      <button disabled className="premium-btn-secondary w-full text-sm opacity-50 cursor-not-allowed">
                        Closed — Not Submitted
                      </button>
                    ) : status === "PENDING" ? (
                      <button onClick={() => startExam(exam.id)} className="premium-btn-primary w-full text-sm">
                        Resume Exam
                      </button>
                    ) : status === "IN_PROGRESS" ? (
                      <button onClick={() => startExam(exam.id)} className="premium-btn-primary w-full text-sm">
                        Continue Exam
                      </button>
                    ) : status === "COMPLETED" ? (
                      <button disabled className="premium-btn-secondary w-full text-sm opacity-50 cursor-not-allowed">
                        Max Attempts Reached
                      </button>
                    ) : status === "ACTIVE" ? (
                      <button onClick={() => startExam(exam.id)} className="premium-btn-primary w-full text-sm">
                        {exam.attemptsCount > 0 ? `Start Attempt ${exam.attemptsCount + 1}` : "Start Exam"}
                      </button>
                    ) : (
                      <button disabled className="premium-btn-secondary w-full text-sm opacity-50 cursor-not-allowed">
                        Available {new Date(exam.startTime).toLocaleString()}
                      </button>
                    )}
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
