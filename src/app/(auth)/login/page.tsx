"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    const errs: { username?: string; password?: string } = {};
    if (!username.trim()) errs.username = "Vui lòng nhập mã số học viên / giảng viên.";
    if (!password) errs.password = "Vui lòng nhập mật khẩu.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Thông tin đăng nhập không hợp lệ.");
        setIsLoading(false);
        return;
      }

      if (data.status === "FORCE_PASSWORD_RESET") {
        localStorage.setItem("reset_token", data.reset_token);
        router.push("/reset-password");
      } else {
        document.cookie = `session=${data.token}; path=/; max-age=28800; secure; samesite=strict`;
        localStorage.setItem("user", JSON.stringify(data.user));
        if (data.user.role === "TEACHER") {
          router.push("/teacher");
        } else {
          router.push("/student/exams");
        }
      }
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center relative px-4 pt-8 pb-10 sm:items-center sm:px-6 sm:py-0 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md z-10 my-auto"
      >
        <div className="glass-card p-6 sm:p-8 md:p-10 relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-60" />

          {/* Logo + heading */}
          <div className="flex flex-col items-center mb-6 sm:mb-8 select-none">
            <Link href="/" className="flex items-center gap-2.5 mb-4 sm:mb-5 group">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-bg-surface-elevated border border-border-strong rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-brand-500/10 group-hover:shadow-brand-500/25 transition-all p-1.5 shrink-0">
                <img src="/Logo_2.png" alt="ITLearn Logo" className="w-full h-full object-contain filter drop-shadow(0 2px 4px rgba(220,38,38,0.3))" />
              </div>
              <div className="text-left">
                <span className="font-display font-extrabold tracking-tight text-white block text-base sm:text-lg leading-none">
                  IT <span className="text-brand-500">LEARN</span>
                </span>
                <span className="text-[9px] text-text-tertiary font-mono uppercase tracking-widest leading-none mt-1 block">
                  Explore IT World
                </span>
              </div>
            </Link>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-1 font-display">
              ĐĂNG NHẬP HỆ THỐNG
            </h2>
            <p className="text-text-secondary text-xs mt-1">
              Online Quiz &amp; Hybrid Coding Platform
            </p>
          </div>

          {/* API-level error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl mb-5"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} noValidate className="space-y-4 sm:space-y-5">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2" htmlFor="username">
                Mã Số Học Viên / Giảng Viên
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) setFieldErrors(p => ({ ...p, username: undefined }));
                }}
                className={`premium-input ${fieldErrors.username ? "border-rose-500 focus:border-rose-500" : ""}`}
                placeholder="Ví dụ: 20261102"
                autoComplete="username"
              />
              {fieldErrors.username && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-400">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {fieldErrors.username}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2" htmlFor="password">
                Mật Khẩu
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined }));
                  }}
                  className={`premium-input pr-12 ${fieldErrors.password ? "border-rose-500 focus:border-rose-500" : ""}`}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
              {fieldErrors.password && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-400">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="premium-btn-primary w-full mt-2 flex justify-center items-center py-3 text-base font-semibold shadow-lg shadow-brand-500/20 active:scale-95"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Đăng Nhập"
              )}
            </button>
          </form>

          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border-strong text-center">
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              Bằng việc đăng nhập, địa chỉ IP của bạn sẽ được liên kết với phiên hoạt động nhằm phục vụ mục đích bảo mật và giám sát chống gian lận.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
