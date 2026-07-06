"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ExamOption {
  id: string;
  title: string;
  description: string | null;
}

interface SessionRow {
  id: string;
  joinCode: string;
  status: "LOBBY" | "QUESTION" | "ENDED";
  questionSeconds: number;
  createdAt: string;
  examTitle: string;
  hostName: string;
  hostUsername: string;
  participantCount: number;
}

const STATUS_STYLES: Record<SessionRow["status"], { label: string; className: string }> = {
  LOBBY: { label: "Lobby", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  QUESTION: { label: "In Progress", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ENDED: { label: "Ended", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

export default function LiveLaunchPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [questionSeconds, setQuestionSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExams = async () => {
    try {
      const res = await fetch("/api/v1/teacher/exams");
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const importFile = async (file: File) => {
    setIsImporting(true);
    setError(null);
    setImportNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/teacher/live-sessions/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportNotice(`Imported ${data.questionCount} questions into "${data.exam.title}".`);
        await loadExams();
        setSelectedExamId(data.exam.id);
      } else {
        setError(data.message || "Could not import the file.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportExam = (examId: string) => {
    window.open(`/api/v1/teacher/exams/${examId}/export-questions`, "_blank");
  };

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSeconds, setEditSeconds] = useState(30);

  const loadSessions = async () => {
    const res = await fetch("/api/v1/teacher/live-sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const saveSeconds = async (sessionId: string) => {
    const res = await fetch(`/api/v1/teacher/live-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionSeconds: editSeconds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message || "Could not update the session.");
    }
    setEditingSessionId(null);
    loadSessions();
  };

  const deleteSession = async (session: SessionRow) => {
    if (
      !window.confirm(
        `Delete the live session for "${session.examTitle}" (code ${session.joinCode})? Scores and answers will be removed.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/v1/teacher/live-sessions/${session.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message || "Could not delete the session.");
    }
    loadSessions();
  };

  const launch = async () => {
    if (!selectedExamId) return;
    setIsLaunching(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/teacher/live-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, questionSeconds }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/teacher/live/${data.session.id}`);
      } else {
        setError(data.message || "Could not start the live session.");
        setIsLaunching(false);
      }
    } catch {
      setError("Network error. Try again.");
      setIsLaunching(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-display font-bold text-white">Host a Live Quiz</h1>
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
        </span>
      </div>
      <p className="text-text-secondary text-sm mb-6">
        Pick an exam with quiz questions. Students join with a code and answer together in real
        time, racing for the leaderboard.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="px-4 py-2 rounded-xl border border-border-strong text-text-secondary hover:text-white hover:border-brand-500/40 disabled:opacity-50 text-sm font-semibold transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" transform="rotate(180 12 12)" />
          </svg>
          {isImporting ? "Importing…" : "Import Questions (.xlsx)"}
        </button>
        <span className="text-text-tertiary text-xs">
          Columns: type, title, question_text, points, option_a–d, correct_identifier
        </span>
      </div>
      {importNotice && <p className="text-emerald-400 text-sm mb-4">{importNotice}</p>}

      {isLoading ? (
        <p className="text-text-secondary text-sm">Loading exams…</p>
      ) : exams.length === 0 ? (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-8 text-center">
          <p className="text-text-secondary text-sm">
            You have no exams yet. Create an exam with quiz questions first.
          </p>
          <button
            onClick={() => router.push("/teacher")}
            className="mt-4 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
          >
            Go to Manage Exams
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-6 max-h-[50vh] overflow-y-auto pr-1">
            {exams.map((exam) => (
              <div
                key={exam.id}
                onClick={() => setSelectedExamId(exam.id)}
                className={`w-full cursor-pointer rounded-xl border p-4 transition-all flex items-start gap-3 ${
                  selectedExamId === exam.id
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-border-strong bg-bg-surface hover:border-brand-500/40"
                }`}
              >
                <div className="flex-grow min-w-0">
                  <p className="text-white text-sm font-semibold">{exam.title}</p>
                  {exam.description && (
                    <p className="text-text-tertiary text-xs mt-1 line-clamp-2">{exam.description}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exportExam(exam.id);
                  }}
                  title="Export quiz questions (.xlsx)"
                  className="shrink-0 p-2 rounded-lg border border-border-strong text-text-tertiary hover:text-white hover:border-brand-500/40 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="bg-bg-surface border border-border-strong rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-grow">
              <p className="text-white text-sm font-semibold">Time per question</p>
              <p className="text-text-tertiary text-xs mt-0.5">
                How long students have to answer each question.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[15, 30, 60, 120].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestionSeconds(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-mono font-semibold border transition-all ${
                    questionSeconds === s
                      ? "border-brand-500 bg-brand-500/10 text-brand-400"
                      : "border-border-strong text-text-secondary hover:text-white"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

          <button
            onClick={launch}
            disabled={!selectedExamId || isLaunching}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-brand-500/20"
          >
            {isLaunching ? "Starting…" : "Start Live Session"}
          </button>
        </>
      )}

      {/* Session management */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-bold text-white">Live Sessions</h2>
          <span className="text-text-tertiary text-xs font-mono">
            {sessions.length} total · {sessions.filter((s) => s.status !== "ENDED").length} active
          </span>
        </div>
        {sessions.length === 0 ? (
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-8 text-center">
            <p className="text-text-secondary text-sm">No live sessions yet.</p>
          </div>
        ) : (
          <div className="bg-bg-surface border border-border-strong rounded-2xl divide-y divide-border-strong overflow-hidden">
            {sessions.map((s) => (
              <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-semibold truncate">{s.examTitle}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLES[s.status].className}`}
                    >
                      {STATUS_STYLES[s.status].label}
                    </span>
                  </div>
                  <p className="text-text-tertiary text-xs mt-1 font-mono">
                    Code {s.joinCode} · {s.participantCount} players · {s.questionSeconds}s/question ·{" "}
                    {new Date(s.createdAt).toLocaleString()} · {s.hostName}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editingSessionId === s.id ? (
                    <>
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={editSeconds}
                        onChange={(e) => setEditSeconds(parseInt(e.target.value, 10) || 30)}
                        className="w-20 bg-bg-surface-elevated border border-border-strong rounded-lg px-2 py-1.5 text-white text-sm font-mono focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        onClick={() => saveSeconds(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-all"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSessionId(null)}
                        className="px-3 py-1.5 rounded-lg border border-border-strong text-text-secondary hover:text-white text-xs transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push(`/teacher/live/${s.id}`)}
                        className="px-3 py-1.5 rounded-lg border border-brand-500/40 text-brand-400 hover:bg-brand-500/10 text-xs font-semibold transition-all"
                      >
                        {s.status === "ENDED" ? "Results" : "Open"}
                      </button>
                      {s.status !== "ENDED" && (
                        <button
                          onClick={() => {
                            setEditingSessionId(s.id);
                            setEditSeconds(s.questionSeconds);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-border-strong text-text-secondary hover:text-white text-xs transition-all"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => deleteSession(s)}
                        className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs transition-all"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
