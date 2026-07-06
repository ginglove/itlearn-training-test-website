"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinLivePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const join = async () => {
    setIsJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/student/live-sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/student/live/${data.sessionId}`);
      } else {
        setError(data.message || "Could not join the session.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Join Live Quiz</h1>
        <p className="text-text-secondary text-sm mb-8">
          Enter the 6-character code your teacher shows on screen.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && join()}
          placeholder="ABC123"
          className="w-full bg-bg-surface border border-border-strong rounded-2xl px-4 py-4 text-center text-3xl font-mono font-black tracking-[0.4em] text-white focus:border-brand-500 focus:outline-none uppercase"
          maxLength={6}
          autoFocus
        />
        {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
        <button
          onClick={join}
          disabled={isJoining || code.length !== 6}
          className="mt-6 w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-brand-500/20"
        >
          {isJoining ? "Joining…" : "Join"}
        </button>
      </div>
    </div>
  );
}
