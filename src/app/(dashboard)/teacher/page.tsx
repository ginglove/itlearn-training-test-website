"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TeacherDashboard() {
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await fetch("/api/v1/teacher/exams", {
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

  const handleClone = async (examId: string) => {
    setCloningId(examId);
    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchExams();
        router.push(`/teacher/exams/${data.exam.id}/edit`);
      } else {
        alert(data.message || "Failed to clone exam.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setCloningId(null);
    }
  };

  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Teacher Dashboard</h1>
            <p className="text-text-secondary">Manage exams, questions, and monitor students.</p>
          </div>
          <button 
            onClick={() => router.push("/teacher/exams/create")}
            className="premium-btn-primary"
          >
            + Create New Exam
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : exams.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <h3 className="text-xl font-medium text-white mb-2">No Exams Yet</h3>
            <p className="text-text-secondary mb-6">Create your first exam to get started.</p>
            <button 
              onClick={() => router.push("/teacher/exams/create")}
              className="premium-btn-secondary"
            >
              Create Exam
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <div key={exam.id} className="glass-card p-6 flex flex-col h-full relative group">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-white pr-6">{exam.title}</h3>
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
                    title="Edit Settings & Access"
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
                
                <div className="space-y-2 mb-6 text-sm text-text-tertiary">
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="text-text-primary">{exam.duration} mins</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Starts:</span>
                    <span className="text-text-primary">{new Date(exam.startTime).toLocaleDateString()}</span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
