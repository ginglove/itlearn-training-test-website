"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import DateTimePicker from "@/app/components/DateTimePicker";
import { useToast, ConfirmModal } from "@/components/toast";

export default function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: examId } = use(params);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    duration: 60,
    startTime: "",
    endTime: "",
    isShuffled: false,
    allowedAttempts: 1,
    accessType: "ALL",
    sessionType: "QUIZ",
  });

  const [students, setStudents] = useState<any[]>([]);
  const [assignedStudents, setAssignedStudents] = useState<string[]>([]);
  const showToast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchExamAndStudents();
  }, []);

  const fetchExamAndStudents = async () => {
    try {
      setIsLoading(true);

      // Fetch Exam details
      const examRes = await fetch(`/api/v1/teacher/exams/${examId}`);
      if (!examRes.ok) {
        throw new Error("Failed to fetch exam details");
      }
      const examData = await examRes.json();
      const exam = examData.exam;

      // Fetch all students
      const studentsRes = await fetch("/api/v1/teacher/students");
      if (!studentsRes.ok) {
        throw new Error("Failed to fetch students");
      }
      const studentsData = await studentsRes.json();

      // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
      const startLocal = new Date(exam.startTime).toISOString().slice(0, 16);
      const endLocal = new Date(exam.endTime).toISOString().slice(0, 16);

      setFormData({
        title: exam.title,
        description: exam.description || "",
        duration: exam.duration,
        startTime: startLocal,
        endTime: endLocal,
        isShuffled: exam.isShuffled,
        allowedAttempts: exam.allowedAttempts || 1,
        accessType: exam.accessType || "ALL",
        sessionType: exam.sessionType || "QUIZ",
      });

      setAssignedStudents(exam.assignedStudents || []);
      setStudents(studentsData.students || []);
    } catch (err: any) {
      showToast(err.message || "An error occurred while loading data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckboxChange = (studentId: string, checked: boolean) => {
    if (checked) {
      setAssignedStudents([...assignedStudents, studentId]);
    } else {
      setAssignedStudents(assignedStudents.filter(id => id !== studentId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          startTime: new Date(formData.startTime).toISOString(),
          endTime: new Date(formData.endTime).toISOString(),
          assignedStudents: formData.accessType === "RESTRICTED" ? assignedStudents : [],
        }),
      });

      if (res.ok) {
        showToast("Exam configurations updated successfully!");
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to update exam", "error");
      }
    } catch (err) {
      showToast("Network error occurred.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/v1/teacher/exams/${examId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/teacher");
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to delete exam", "error");
        setIsDeleting(false);
      }
    } catch (err) {
      showToast("Network error occurred.", "error");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="text-text-secondary hover:text-white transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-white">Edit Exam Settings</h1>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-all font-semibold text-sm"
          >
            {isDeleting ? "Deleting..." : "Delete Exam"}
          </button>
        </div>

        <div className="glass-card p-4 sm:p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Exam Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="premium-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Description (Optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="premium-input min-h-[100px] resize-y"
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Allowed Attempts</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.allowedAttempts}
                  onChange={(e) => setFormData({ ...formData, allowedAttempts: parseInt(e.target.value) })}
                  className="premium-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Session Type</label>
                <select
                  value={formData.sessionType}
                  onChange={(e) => setFormData({ ...formData, sessionType: e.target.value })}
                  className="premium-input bg-bg-surface-elevated text-white w-full"
                >
                  <option value="HOMEWORK">Homework</option>
                  <option value="QUIZ">Quiz Session</option>
                  <option value="PRACTICE">Practice</option>
                  <option value="FINAL">Final Exam</option>
                </select>
              </div>
            </div>

            <div>
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

            {/* Access Control section */}
            <div className="pt-6 border-t border-border-strong">
              <h3 className="text-lg font-bold text-white mb-4">Exam Access Control</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Who can access this exam?</label>
                <select
                  value={formData.accessType}
                  onChange={(e) => setFormData({ ...formData, accessType: e.target.value })}
                  className="premium-input bg-bg-surface-elevated text-white w-full border border-border-strong rounded-xl p-3 focus:outline-none focus:border-brand-500"
                >
                  <option value="ALL">All Students</option>
                  <option value="RESTRICTED">Restricted (Select specific students)</option>
                </select>
              </div>

              {formData.accessType === "RESTRICTED" && (
                <div className="bg-bg-surface-elevated/50 border border-border-strong rounded-xl p-6">
                  <h4 className="text-sm font-bold text-white mb-3">Assign Students</h4>
                  {students.length === 0 ? (
                    <p className="text-text-tertiary text-sm">No students registered in the system.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2">
                      {students.map((student) => (
                        <label 
                          key={student.id} 
                          className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface hover:bg-bg-surface-elevated border border-border-strong cursor-pointer transition-all"
                        >
                          <input
                            type="checkbox"
                            checked={assignedStudents.includes(student.id)}
                            onChange={(e) => handleCheckboxChange(student.id, e.target.checked)}
                            className="w-4 h-4 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                          />
                          <div className="text-left">
                            <div className="text-sm font-medium text-white">{student.fullName}</div>
                            <div className="text-xs text-text-tertiary">@{student.username} • {student.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                disabled={isSaving}
                className="premium-btn-primary min-w-[140px]"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        variant="danger"
        title="Delete Exam"
        description="Are you sure you want to permanently delete this exam? All student submissions, answers, and grades will be lost. This action cannot be undone."
        confirmLabel={isDeleting ? "Deleting..." : "Delete Exam"}
        cancelLabel="Keep Exam"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => { setShowDeleteConfirm(false); handleDelete(); }}
      />
    </div>
  );
}
