"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DateTimePicker from "@/app/components/DateTimePicker";

export default function CreateExamPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    duration: 60,
    startTime: "",
    endTime: "",
    isShuffled: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/teacher/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          startTime: new Date(formData.startTime).toISOString(),
          endTime: new Date(formData.endTime).toISOString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/teacher/exams/${data.exam.id}/questions`);
      } else {
        const data = await res.json();
        setError(data.message || "Failed to create exam");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="text-text-secondary hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-white">Create New Exam</h1>
        </div>

        <div className="glass-card p-8">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Exam Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="premium-input"
                placeholder="e.g. Midterm: Data Structures"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Description (Optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="premium-input min-h-[100px] resize-y"
                placeholder="Provide instructions for students..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DateTimePicker
                label="Start Time"
                required
                value={formData.startTime}
                onChange={(val) => setFormData({ ...formData, startTime: val })}
              />
              <DateTimePicker
                label="End Time"
                required
                value={formData.endTime}
                onChange={(val) => setFormData({ ...formData, endTime: val })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Duration (Minutes)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  className="premium-input"
                />
              </div>
              <div className="flex items-center h-full pt-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isShuffled}
                    onChange={(e) => setFormData({ ...formData, isShuffled: e.target.checked })}
                    className="w-5 h-5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-white">Shuffle Questions</span>
                </label>
              </div>
            </div>

            <div className="pt-6 border-t border-border-strong flex justify-end gap-4">
              <button 
                type="button"
                onClick={() => router.back()}
                className="premium-btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isLoading}
                className="premium-btn-primary min-w-[140px]"
              >
                {isLoading ? "Creating..." : "Create Exam"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
