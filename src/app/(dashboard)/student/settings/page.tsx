"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UserInfo {
  id: string;
  username: string;
  full_name: string;
  role: string;
}

export default function StudentSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  // ── Full name form ───────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Password form ────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdatingPw, setIsUpdatingPw] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Complexity checks
  const reqLength = newPassword.length >= 8 && newPassword.length <= 128;
  const reqUpper = /[A-Z]/.test(newPassword);
  const reqLower = /[a-z]/.test(newPassword);
  const reqNumber = /\d/.test(newPassword);
  const reqSpecial = /[@$!%*?&]/.test(newPassword);
  const isMatch = newPassword === confirmPassword && newPassword.length > 0;
  const allReqsMet = reqLength && reqUpper && reqLower && reqNumber && reqSpecial && isMatch;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setFullName(parsed.full_name || "");
      }
    } catch {}
  }, []);

  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) return;
    setIsUpdatingName(true);
    setNameMessage(null);
    try {
      const res = await fetch("/api/v1/student/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      const data = await res.json();
      if (res.ok) {
        setNameMessage({ type: "success", text: "Full name updated successfully." });
        // Update localStorage so the sidebar reflects the new name
        const stored = localStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.full_name = data.fullName;
          localStorage.setItem("user", JSON.stringify(parsed));
          setUser(parsed);
        }
      } else {
        setNameMessage({ type: "error", text: data.message || "Failed to update name." });
      }
    } catch {
      setNameMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allReqsMet) return;
    setIsUpdatingPw(true);
    setPwMessage(null);
    try {
      const res = await fetch("/api/v1/student/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMessage({ type: "success", text: "Password updated successfully. Use your new password on next login." });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } else {
        setPwMessage({ type: "error", text: data.message || "Failed to update password." });
      }
    } catch {
      setPwMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setIsUpdatingPw(false);
    }
  };

  const EyeIcon = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle}
      className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-secondary hover:text-white transition-colors">
      {show ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );

  const Req = ({ met, label }: { met: boolean; label: string }) => (
    <div className={`flex items-center gap-2 transition-colors ${met ? "text-brand-400" : "text-text-tertiary"}`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${met ? "bg-brand-400" : "bg-text-tertiary"}`} />
      <span>{label}</span>
    </div>
  );

  const Alert = ({ msg, onClose }: { msg: { type: "success" | "error"; text: string }; onClose: () => void }) => (
    <div className={`p-4 rounded-xl mb-5 flex justify-between items-start gap-3 text-sm font-medium ${
      msg.type === "success"
        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
        : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
    }`}>
      <span>{msg.text}</span>
      <button onClick={onClose} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-text-secondary mt-1 text-sm">Manage your profile and update your credentials.</p>
        </div>

        {/* ── Profile Info (read-only) ── */}
        <div className="glass-card p-6 mb-6">
          <h2 className="text-base font-bold text-white mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Full Name", value: user?.full_name || "—" },
              { label: "Student ID (Username)", value: user?.username || "—" },
              { label: "Account Role", value: user?.role || "STUDENT" },
              { label: "Session Status", value: "Active" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-surface-elevated/50 rounded-xl px-4 py-3">
                <span className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">{label}</span>
                <span className={`text-sm font-medium ${label === "Session Status" ? "text-emerald-400" : "text-white"}`}>
                  {label === "Session Status" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {value}
                    </span>
                  ) : value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Edit Full Name ── */}
        <div className="glass-card p-6 mb-6">
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Full Name
          </h2>
          <p className="text-text-secondary text-sm mb-5">Update the name displayed across your account.</p>

          {nameMessage && <Alert msg={nameMessage} onClose={() => setNameMessage(null)} />}

          <form onSubmit={handleNameUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Full Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="premium-input"
                placeholder="Enter your full name"
              />
              <p className="text-text-tertiary text-xs mt-1.5">Must be 2–100 characters.</p>
            </div>
            <div className="pt-1">
              <button
                type="submit"
                disabled={isUpdatingName || fullName.trim().length < 2 || fullName.trim() === (user?.full_name ?? "")}
                className="premium-btn-primary flex items-center gap-2 px-6"
              >
                {isUpdatingName ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Name
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── Change Password ── */}
        <div className="glass-card p-6">
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Change Password
          </h2>
          <p className="text-text-secondary text-sm mb-6">For security, enter your current password before setting a new one.</p>

          {pwMessage && <Alert msg={pwMessage} onClose={() => setPwMessage(null)} />}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            {/* Current */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Current Password</label>
              <div className="relative">
                <input type={showCurrent ? "text" : "password"} required value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="premium-input pr-12" placeholder="Enter current password" />
                <EyeIcon show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />
              </div>
            </div>
            {/* New */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">New Password</label>
              <div className="relative">
                <input type={showNew ? "text" : "password"} required value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="premium-input pr-12" placeholder="Enter new password" />
                <EyeIcon show={showNew} onToggle={() => setShowNew(!showNew)} />
              </div>
            </div>
            {/* Confirm */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Confirm New Password</label>
              <div className="relative">
                <input type={showConfirm ? "text" : "password"} required value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="premium-input pr-12" placeholder="Confirm new password" />
                <EyeIcon show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
              </div>
            </div>
            {/* Complexity */}
            {newPassword.length > 0 && (
              <div className="bg-bg-surface border border-border-strong rounded-xl p-4 text-xs space-y-2">
                <Req met={reqLength} label="8–128 characters" />
                <Req met={reqUpper} label="One uppercase letter" />
                <Req met={reqLower} label="One lowercase letter" />
                <Req met={reqNumber} label="One digit" />
                <Req met={reqSpecial} label="One special character (@$!%*?&)" />
                <div className="border-t border-border-strong pt-2 mt-1">
                  <Req met={isMatch} label="Passwords match" />
                </div>
              </div>
            )}
            <div className="pt-2">
              <button type="submit" disabled={isUpdatingPw || !allReqsMet || !currentPassword}
                className="premium-btn-primary w-full flex justify-center items-center gap-2">
                {isUpdatingPw ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Updating Password...
                  </>
                ) : "Update Password"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
