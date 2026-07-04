"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("reset_token");
    if (!token) {
      router.push("/login");
    } else {
      setResetToken(token);
    }
  }, [router]);

  // Real-time complexity checks (RSD Section 2.2)
  const reqLength = password.length >= 8 && password.length <= 128;
  const reqUpper = /[A-Z]/.test(password);
  const reqLower = /[a-z]/.test(password);
  const reqNumber = /\d/.test(password);
  const reqSpecial = /[@$!%*?&]/.test(password);
  const isMatch = password === confirmPassword && password.length > 0;
  const allReqsMet = reqLength && reqUpper && reqLower && reqNumber && reqSpecial && isMatch;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allReqsMet) return;

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          reset_token: resetToken, 
          new_password: password 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to reset password");
        setIsLoading(false);
        return;
      }

      // Cleanup and redirect based on role
      localStorage.removeItem("reset_token");
      document.cookie = `session=${data.token}; path=/; max-age=28800; secure; samesite=strict`;
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      if (data.role === "ADMIN") {
        router.push("/admin");
      } else if (data.role === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/student/exams");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-8 sm:px-6">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md z-10"
      >
        <div className="glass-card p-6 sm:p-8 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">First Time Login</h1>
            <p className="text-text-secondary text-sm">
              Please set a strong password to activate your account.
            </p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="premium-input pr-12"
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-secondary hover:text-white transition-colors"
                >
                  {showPassword ? (
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
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="premium-input pr-12"
                  placeholder="Confirm password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-secondary hover:text-white transition-colors"
                >
                  {showConfirmPassword ? (
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
              </div>
            </div>

            {/* Complexity Indicator */}
            <div className="bg-bg-surface p-4 rounded-xl border border-border-strong text-sm space-y-2 mt-4">
              <div className={`flex items-center gap-2 ${reqLength ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${reqLength ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                8-128 characters
              </div>
              <div className={`flex items-center gap-2 ${reqUpper ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${reqUpper ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                One uppercase letter
              </div>
              <div className={`flex items-center gap-2 ${reqLower ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${reqLower ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                One lowercase letter
              </div>
              <div className={`flex items-center gap-2 ${reqNumber ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${reqNumber ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                One digit
              </div>
              <div className={`flex items-center gap-2 ${reqSpecial ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${reqSpecial ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                One special character (@$!%*?&)
              </div>
              <div className={`flex items-center gap-2 pt-2 border-t border-border-strong ${isMatch ? 'text-brand-400' : 'text-text-tertiary'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isMatch ? 'bg-brand-400' : 'bg-text-tertiary'}`} />
                Passwords match
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !allReqsMet}
              className="premium-btn-primary w-full mt-6 flex justify-center items-center"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Update Password & Continue"
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
