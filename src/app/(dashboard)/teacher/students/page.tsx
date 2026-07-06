"use client";

import { useState, useEffect, useRef } from "react";
import StudentWorkspacesModal from "@/app/components/StudentWorkspacesModal";
import { useActiveWorkspace, withWorkspaceParam } from "@/app/components/useActiveWorkspace";
import { useRouter } from "next/navigation";

interface Student {
  id: string;
  username: string;
  fullName: string;
  email: string;
  isFirstLogin: boolean;
  createdAt: string;
}

export default function StudentsManagementPage() {
  const router = useRouter();
  const [activeWorkspaceId] = useActiveWorkspace();
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Message states
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Workspace membership modal
  const [workspacesFor, setWorkspacesFor] = useState<Student | null>(null);

  // Bulk Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add Student states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addFormData, setAddFormData] = useState({ username: "", fullName: "", email: "" });
  const [addSuccessResult, setAddSuccessResult] = useState<{ student: Student; temporaryPassword: string } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Delete Student states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  // Reset Student Password states
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [studentToReset, setStudentToReset] = useState<Student | null>(null);
  const [resetSuccessResult, setResetSuccessResult] = useState<{ student: Student; temporaryPassword: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Exam History panel states
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, [activeWorkspaceId]);

  const getCookie = (name: string) => {
    if (typeof document === "undefined") return "";
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift();
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(withWorkspaceParam("/api/v1/teacher/students", activeWorkspaceId), {
        headers: {
          "Authorization": `Bearer ${getCookie("session")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
      } else {
        setMessage({ type: "error", text: "Failed to fetch student list." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Failed to connect to the server." });
    } finally {
      setIsLoading(false);
    }
  };

  const openHistory = async (student: Student) => {
    setHistoryStudent(student);
    setHistoryData([]);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/v1/teacher/students/${student.id}/exams`);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data.exams || []);
      }
    } catch {
      // silently fail — panel shows empty state
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);
    setBulkResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/v1/teacher/students/bulk-create`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: `Successfully provisioned ${data.count} student accounts.` });
        setBulkResult(data.credentials);
        fetchStudents();
      } else {
        setMessage({ type: "error", text: data.message || "Failed to import students." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error during upload." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadBulkCredentials = () => {
    if (!bulkResult) return;
    
    const headers = "Student ID,Full Name,Email,Temporary Password\n";
    const csvRows = bulkResult.map((c: any) => 
      `"${c.username}","${c.fullName}","${c.email}","${c.temporaryPassword}"`
    ).join("\n");
    
    const blob = new Blob([headers + csvRows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_credentials_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);
    setAddSuccessResult(null);

    try {
      const res = await fetch("/api/v1/teacher/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getCookie("session")}`
        },
        body: JSON.stringify(addFormData)
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setAddSuccessResult({
          student: data.student,
          temporaryPassword: data.temporaryPassword
        });
        setAddFormData({ username: "", fullName: "", email: "" });
        fetchStudents();
      } else {
        setAddError(data.message || "Failed to add student.");
      }
    } catch (err) {
      setAddError("Network error. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteConfirm = (student: Student) => {
    setStudentToDelete(student);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteStudentSubmit = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/teacher/students/${studentToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${getCookie("session")}`
        }
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: "success", text: `Successfully removed student ${studentToDelete.fullName}.` });
        setIsDeleteModalOpen(false);
        setStudentToDelete(null);
        fetchStudents();
      } else {
        setMessage({ type: "error", text: data.message || "Failed to remove student." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error during student removal." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPasswordConfirm = (student: Student) => {
    setStudentToReset(student);
    setResetSuccessResult(null);
    setResetError(null);
    setIsResetModalOpen(true);
  };

  const handleResetPasswordSubmit = async () => {
    if (!studentToReset) return;
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/v1/teacher/students/${studentToReset.id}/reset-password`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getCookie("session")}`
        }
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setResetSuccessResult({
          student: data.student,
          temporaryPassword: data.temporaryPassword
        });
        fetchStudents();
      } else {
        setResetError(data.message || "Failed to reset password.");
      }
    } catch (err) {
      setResetError("Network error. Please try again.");
    } finally {
      setIsResetting(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = students.filter(student => 
    student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bg-base p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Manage Students</h1>
            <p className="text-text-secondary mt-1 text-sm">Students enrolled in your assigned workspaces. New accounts are created by an administrator.</p>
          </div>
        </div>

        {/* Alerts */}
        {message && (
          <div className={`p-4 rounded-xl mb-6 flex justify-between items-center ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            <span className="text-sm font-medium">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-text-secondary hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Main List Card */}
        <div className="glass-card p-6 mb-8">
          {/* Filters & Actions Bar */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-6 border-b border-border-strong pb-6">
            <div className="relative flex-grow max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-tertiary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search students by name, email, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="premium-input pl-10"
              />
            </div>
            <div className="text-sm text-text-secondary self-center">
              Total: <span className="font-semibold text-white">{filteredStudents.length}</span> / {students.length} students
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="text-center py-20">
                <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-text-secondary text-sm">Fetching student roster...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 text-text-tertiary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="text-lg font-medium text-white mb-1">No Students Found</h3>
                <p className="text-text-secondary text-sm">
                  {searchQuery ? "Try searching for a different keyword." : "Ask an administrator to create student accounts, then enroll them into your workspaces."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-strong text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    <th className="py-4 px-4">Full Name</th>
                    <th className="py-4 px-4">Student ID</th>
                    <th className="py-4 px-4">Email</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Joined Date</th>
                    <th className="py-4 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-sm">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-4 font-medium text-white">{student.fullName}</td>
                      <td className="py-4 px-4 font-mono text-text-secondary">{student.username}</td>
                      <td className="py-4 px-4 text-text-secondary">{student.email}</td>
                      <td className="py-4 px-4">
                        {student.isFirstLogin ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Pending Reset
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-text-tertiary">
                        {new Date(student.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setWorkspacesFor(student)}
                            className="text-text-tertiary hover:text-brand-400 transition-colors p-1.5 rounded-lg hover:bg-brand-500/10"
                            title="Manage workspaces"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openHistory(student)}
                            className="text-text-tertiary hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-500/10"
                            title="View exam history"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleResetPasswordConfirm(student)}
                            className="text-text-tertiary hover:text-amber-400 transition-colors p-1.5 rounded-lg hover:bg-amber-500/10"
                            title="Reset password"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m-5-4a5 5 0 015 5c0 2.159-1.369 4-3 5.024V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-3.024c-1.631-1.024-3-2.865-3-5.024a5 5 0 015-5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteConfirm(student)}
                            className="text-text-tertiary hover:text-rose-400 transition-colors p-1.5 rounded-lg hover:bg-rose-500/10"
                            title="Remove student"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Bulk Provision Area */}
        <div className="glass-card p-8">
          <div className="mb-6 border-b border-border-strong pb-4">
            <h2 className="text-xl font-bold text-white mb-2">Bulk Provision Accounts</h2>
            <p className="text-text-secondary text-sm">
              Upload an Excel (.xlsx) file containing student_id, full_name, and email to import multiple students at once.
            </p>
          </div>

          {bulkResult && (
            <div className="mt-6 bg-brand-500/10 border border-brand-500/20 rounded-xl p-5">
              <h3 className="text-base font-semibold text-brand-400 mb-1.5 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Roster Upload Processed
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                Student credentials have been provisioned. Download the file now; passwords cannot be displayed again.
              </p>
              <button 
                onClick={handleDownloadBulkCredentials}
                className="premium-btn-secondary w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Credentials (CSV)
              </button>
            </div>
          )}
        </div>

      </div>

      {workspacesFor && (
        <StudentWorkspacesModal
          student={workspacesFor}
          onClose={() => setWorkspacesFor(null)}
          onSaved={({ added, removed, blocked }) => {
            setWorkspacesFor(null);
            setMessage(
              blocked.length
                ? { type: "error", text: `Added ${added}, removed ${removed}. Blocked: ${blocked.join("; ")}` }
                : { type: "success", text: `Workspaces updated (added ${added}, removed ${removed}).` }
            );
            fetchStudents();
          }}
        />
      )}

      {/* Add Student Overlay Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-card w-full max-w-lg p-8 shadow-2xl relative border border-border-strong bg-bg-surface">
            
            {/* Close icon */}
            <button 
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-6 right-6 text-text-tertiary hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {!addSuccessResult ? (
              <>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white">Add New Student</h3>
                  <p className="text-sm text-text-secondary mt-1">Configure user details to create a student account.</p>
                </div>

                {addError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl mb-4 text-sm font-medium">
                    {addError}
                  </div>
                )}

                <form onSubmit={handleAddStudentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Student ID (Username)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. b21dccn123"
                      value={addFormData.username}
                      onChange={(e) => setAddFormData({...addFormData, username: e.target.value})}
                      className="premium-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Full Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Nguyen Van A"
                      value={addFormData.fullName}
                      onChange={(e) => setAddFormData({...addFormData, fullName: e.target.value})}
                      className="premium-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Email Address</label>
                    <input 
                      type="email" 
                      required
                      placeholder="e.g. student@itlearn.edu.vn"
                      value={addFormData.email}
                      onChange={(e) => setAddFormData({...addFormData, email: e.target.value})}
                      className="premium-input"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-border-strong mt-6">
                    <button 
                      type="button" 
                      onClick={() => setIsAddModalOpen(false)}
                      className="premium-btn-secondary flex-1 py-2.5 text-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isAdding}
                      className="premium-btn-primary flex-1 py-2.5 text-sm"
                    >
                      {isAdding ? "Creating..." : "Create Account"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <h3 className="text-2xl font-bold text-white mb-2">Account Provisioned</h3>
                <p className="text-sm text-text-secondary mb-6">
                  Account successfully created. Below is the temporary password generated for this student.
                </p>

                {/* Password display panel */}
                <div className="bg-bg-base border border-border-strong rounded-xl p-5 mb-6 text-left space-y-3">
                  <div>
                    <span className="text-xs text-text-tertiary block font-semibold uppercase tracking-wider">Full Name</span>
                    <span className="text-sm text-white font-medium">{addSuccessResult.student.fullName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary block font-semibold uppercase tracking-wider">Student ID (Username)</span>
                    <span className="text-sm text-white font-mono">{addSuccessResult.student.username}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary block font-semibold uppercase tracking-wider">Email Address</span>
                    <span className="text-sm text-white font-medium">{addSuccessResult.student.email}</span>
                  </div>
                  <div className="relative pt-2 border-t border-border-subtle">
                    <span className="text-xs text-brand-400 block font-semibold uppercase tracking-wider mb-1">Temporary Password</span>
                    <div className="flex items-center justify-between bg-bg-surface-elevated px-3 py-2.5 rounded-lg border border-border-strong">
                      <span className="font-mono text-base font-semibold text-white tracking-wide">{addSuccessResult.temporaryPassword}</span>
                      <button 
                        onClick={() => handleCopyText(addSuccessResult.temporaryPassword)}
                        className="text-text-secondary hover:text-white transition-colors p-1"
                        title="Copy password"
                      >
                        {copied ? (
                          <span className="text-xs text-brand-400 font-semibold">Copied!</span>
                        ) : (
                          <svg className="w-5 h-5 text-text-secondary hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-5 4h5m-5 4h5m-5 4h5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs text-left mb-6 flex gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    Copy these credentials now. For security purposes, this password is saved as a secure hash and cannot be recovered or displayed again.
                  </span>
                </div>

                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="premium-btn-primary w-full py-3"
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Reset Password Overlay Modal */}
      {isResetModalOpen && studentToReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-card w-full max-w-lg p-8 shadow-2xl relative border border-border-strong bg-bg-surface">
            
            {/* Close icon */}
            <button 
              onClick={() => {
                setIsResetModalOpen(false);
                setStudentToReset(null);
                setResetSuccessResult(null);
                setResetError(null);
              }}
              className="absolute top-6 right-6 text-text-tertiary hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {!resetSuccessResult ? (
              <>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white">Reset Password</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Resetting the password for <span className="font-semibold text-white">{studentToReset.fullName}</span> ({studentToReset.username}).
                  </p>
                </div>

                {resetError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl mb-4 text-sm font-medium">
                    {resetError}
                  </div>
                )}

                <p className="text-sm text-text-secondary mb-6">
                  This will generate a new random temporary password for this student. They will be flagged as **Pending Reset** and required to set a new password on their next login.
                </p>

                <div className="flex gap-3 pt-4 border-t border-border-strong mt-6">
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsResetModalOpen(false);
                      setStudentToReset(null);
                      setResetError(null);
                    }}
                    className="premium-btn-secondary flex-1 py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleResetPasswordSubmit}
                    disabled={isResetting}
                    className="premium-btn-primary flex-1 py-2.5 text-sm"
                  >
                    {isResetting ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <h3 className="text-2xl font-bold text-white mb-2">Password Reset Successful</h3>
                <p className="text-sm text-text-secondary mb-6">
                  A new password has been generated. Provide these credentials to the student.
                </p>

                {/* Password display panel */}
                <div className="bg-bg-base border border-border-strong rounded-xl p-5 mb-6 text-left space-y-3">
                  <div>
                    <span className="text-xs text-text-tertiary block font-semibold uppercase tracking-wider">Full Name</span>
                    <span className="text-sm text-white font-medium">{resetSuccessResult.student.fullName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary block font-semibold uppercase tracking-wider">Student ID (Username)</span>
                    <span className="text-sm text-white font-mono">{resetSuccessResult.student.username}</span>
                  </div>
                  <div className="relative pt-2 border-t border-border-subtle">
                    <span className="text-xs text-brand-400 block font-semibold uppercase tracking-wider mb-1">New Temporary Password</span>
                    <div className="flex items-center justify-between bg-bg-surface-elevated px-3 py-2.5 rounded-lg border border-border-strong">
                      <span className="font-mono text-base font-semibold text-white tracking-wide">{resetSuccessResult.temporaryPassword}</span>
                      <button 
                        onClick={() => handleCopyText(resetSuccessResult.temporaryPassword)}
                        className="text-text-secondary hover:text-white transition-colors p-1"
                        title="Copy password"
                      >
                        {copied ? (
                          <span className="text-xs text-brand-400 font-semibold">Copied!</span>
                        ) : (
                          <svg className="w-5 h-5 text-text-secondary hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-5 4h5m-5 4h5m-5 4h5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs text-left mb-6 flex gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    Copy these credentials now. This password is saved as a secure hash and cannot be displayed again.
                  </span>
                </div>

                <button 
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setStudentToReset(null);
                    setResetSuccessResult(null);
                    setResetError(null);
                  }}
                  className="premium-btn-primary w-full py-3"
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {isDeleteModalOpen && studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-card w-full max-w-md p-6 shadow-2xl relative border border-rose-500/20 bg-bg-surface">
            
            <div className="text-center">
              <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">Remove Student Account?</h3>
              <p className="text-sm text-text-secondary mb-6">
                Are you sure you want to remove <span className="font-semibold text-white">{studentToDelete.fullName}</span> ({studentToDelete.username})?
                This will permanently delete their account, credentials, and all historical exam submissions. This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setStudentToDelete(null);
                  }}
                  className="premium-btn-secondary flex-1 py-2.5 text-sm"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteStudentSubmit}
                  disabled={isDeleting}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl flex-1 py-2.5 text-sm transition-all active:scale-95 shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isDeleting ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Exam History Slide-Over Panel */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setHistoryStudent(null)}
          />
          {/* Panel */}
          <div className="relative w-full max-w-2xl bg-bg-surface border-l border-border-strong h-full flex flex-col shadow-2xl animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-strong shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{historyStudent.fullName}</h2>
                <p className="text-xs text-text-tertiary font-mono mt-0.5">{historyStudent.username} Â· {historyStudent.email}</p>
              </div>
              <button
                onClick={() => setHistoryStudent(null)}
                className="text-text-tertiary hover:text-white transition-colors p-1.5 rounded-lg hover:bg-bg-surface-elevated"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary Bar */}
            {!isLoadingHistory && historyData.length > 0 && (
              <div className="px-6 py-4 border-b border-border-strong bg-bg-surface-elevated/30 shrink-0">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-extrabold text-white">{historyData.length}</div>
                    <div className="text-xs text-text-tertiary mt-0.5">Exams Joined</div>
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-emerald-400">
                      {historyData.filter(e => e.attempts.some((a: any) => a.status === "SUBMITTED")).length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-0.5">Completed</div>
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-blue-400">
                      {historyData.filter(e => e.attempts.some((a: any) => a.status === "IN_PROGRESS")).length}
                    </div>
                    <div className="text-xs text-text-tertiary mt-0.5">In Progress</div>
                  </div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-20 text-text-tertiary">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">This student has not participated in any of your exams yet.</p>
                </div>
              ) : (
                historyData.map((examEntry: any) => {
                  const bestSubmission = examEntry.attempts
                    .filter((a: any) => a.status === "SUBMITTED")
                    .sort((a: any, b: any) => (b.totalScore ?? 0) - (a.totalScore ?? 0))[0];
                  const hasActive = examEntry.attempts.some((a: any) => a.status === "IN_PROGRESS");

                  return (
                    <div key={examEntry.examId} className="glass-card p-5 border border-border-strong rounded-xl">
                      {/* Exam title & overall badge */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-white text-sm leading-tight pr-4">{examEntry.examTitle}</h3>
                        {hasActive ? (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">In Progress</span>
                        ) : bestSubmission ? (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">Completed</span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-bg-surface-elevated text-text-tertiary shrink-0">No Submission</span>
                        )}
                      </div>

                      {/* Score bar */}
                      {bestSubmission && examEntry.maxScore > 0 && (
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-text-tertiary mb-1">
                            <span>Best Score</span>
                            <span className="text-white font-semibold">
                              {bestSubmission.totalScore ?? 0} / {examEntry.maxScore}
                            </span>
                          </div>
                          <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
                              style={{ width: `${Math.min(100, ((bestSubmission.totalScore ?? 0) / examEntry.maxScore) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Attempts list */}
                      <div className="space-y-2 mt-3">
                        {examEntry.attempts.map((attempt: any) => (
                          <div
                            key={attempt.submissionId}
                            className="flex items-center justify-between text-xs bg-bg-base/50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2 text-text-secondary">
                              <span className="font-mono text-text-tertiary">#{attempt.attempt}</span>
                              <span>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not submitted"}</span>
                              {attempt.focusLossCount > 0 && (
                                <span className="text-amber-400 font-medium">{attempt.focusLossCount} focus loss{attempt.focusLossCount > 1 ? "es" : ""}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {attempt.status === "SUBMITTED" ? (
                                <span className="font-bold text-white">{attempt.totalScore ?? 0} pts</span>
                              ) : (
                                <span className="text-blue-400 font-medium">In Progress</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

