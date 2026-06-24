"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await fetch("/api/v1/student/exams", {
        headers: {
          "Authorization": `Bearer ${getCookie("session")}`
        }
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
    if (parts.length === 2) return parts.pop()?.split(';').shift();
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
        alert(data.message || "Failed to start exam");
      }
    } catch (err) {
      alert("Network error. Could not connect to exam server.");
    }
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">My Assessments</h1>
          <p className="text-text-secondary">View and access your available exams.</p>
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : exams.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <h3 className="text-xl font-medium text-white mb-2">No Exams Available</h3>
            <p className="text-text-secondary">You currently have no assigned exams.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <div key={exam.id} className="glass-card p-6 flex flex-col h-full border border-border-strong relative overflow-hidden">
                {/* Status Ribbon */}
                {exam.hasActiveAttempt ? (
                  <div className="absolute top-4 right-4 text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full animate-pulse">
                    In Progress
                  </div>
                ) : exam.attemptsCount >= exam.allowedAttempts ? (
                  <div className="absolute top-4 right-4 text-xs font-bold text-text-tertiary bg-bg-surface-elevated px-3 py-1 rounded-full">
                    Completed
                  </div>
                ) : exam.isActive ? (
                  <div className="absolute top-4 right-4 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Active
                  </div>
                ) : (
                  <div className="absolute top-4 right-4 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                    Upcoming
                  </div>
                )}

                <h3 className="text-xl font-bold text-white mb-2 pr-20">{exam.title}</h3>
                <p className="text-text-secondary text-sm mb-6 flex-grow">
                  {exam.description || "No description provided."}
                </p>
                
                <div className="bg-bg-surface-elevated/50 rounded-xl p-4 mb-6 space-y-2 text-sm text-text-tertiary">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Duration
                    </span>
                    <span className="text-white font-medium">{exam.duration} minutes</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Closes
                    </span>
                    <span className="text-white font-medium">{new Date(exam.endTime).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border-strong/50">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Attempts Used
                    </span>
                    <span className="text-white font-medium">{exam.attemptsCount} / {exam.allowedAttempts}</span>
                  </div>
                </div>

                {exam.hasActiveAttempt ? (
                  <button 
                    onClick={() => startExam(exam.id)}
                    className="premium-btn-primary w-full"
                  >
                    Resume Exam
                  </button>
                ) : exam.attemptsCount >= exam.allowedAttempts ? (
                  <button disabled className="premium-btn-secondary w-full opacity-50 cursor-not-allowed">
                    Max Attempts Reached
                  </button>
                ) : exam.isActive ? (
                  <button 
                    onClick={() => startExam(exam.id)}
                    className="premium-btn-primary w-full"
                  >
                    {exam.attemptsCount > 0 ? `Start Attempt ${exam.attemptsCount + 1}` : "Start Exam"}
                  </button>
                ) : (
                  <button disabled className="premium-btn-secondary w-full opacity-50 cursor-not-allowed text-xs">
                    Available {new Date(exam.startTime).toLocaleString()}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
