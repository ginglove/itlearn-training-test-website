"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { ToastProvider } from "@/components/toast";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    localStorage.removeItem("user");
    router.push("/login");
  };

  const navItems = [
    {
      name: "Manage Exams",
      href: "/teacher",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: "Workspaces",
      href: "/teacher/workspaces",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      name: "Manage Students",
      href: "/teacher/students",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: "Session Monitor",
      href: "/teacher/sessions",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const isActive = (href: string) => {
    if (href === "/teacher") return pathname === "/teacher";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-bg-surface border-b border-border-strong text-white sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-bg-surface-elevated border border-border-strong rounded-lg flex items-center justify-center overflow-hidden shadow-sm shadow-brand-500/10 p-1 shrink-0">
            <img src="/Logo_2.png" alt="ITLearn Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="font-display font-extrabold tracking-tight text-white block text-sm leading-none">IT <span className="text-brand-500">LEARN</span></span>
            <span className="text-[8px] text-text-tertiary font-mono uppercase tracking-widest leading-none mt-0.5 block">Teacher Panel</span>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-text-secondary hover:text-white focus:outline-none"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[57px] bg-bg-base/95 backdrop-blur-md z-30 flex flex-col p-6 animate-fade-in border-t border-border-strong">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  router.push(item.href);
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all text-left ${
                  isActive(item.href)
                    ? "bg-brand-500/10 border border-brand-500/25 text-brand-400 shadow-md shadow-brand-500/5"
                    : "text-text-secondary hover:bg-bg-surface-elevated hover:text-white border border-transparent"
                }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all border border-transparent text-left mt-4"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 bg-bg-surface border-r border-border-strong text-white sticky top-0 h-screen p-6">
        <div className="flex items-center gap-2.5 mb-10 px-2 select-none">
          <div className="w-9 h-9 bg-bg-surface-elevated border border-border-strong rounded-xl flex items-center justify-center overflow-hidden shadow-md shadow-brand-500/10 p-1 shrink-0">
            <img src="/Logo_2.png" alt="ITLearn Logo" className="w-full h-full object-contain filter drop-shadow(0 2px 4px rgba(220,38,38,0.2))" />
          </div>
          <div>
            <span className="font-display font-extrabold tracking-tight text-white block text-base leading-none">
              IT <span className="text-brand-500">LEARN</span>
            </span>
            <span className="text-[9px] text-text-tertiary font-mono uppercase tracking-widest mt-1 block">
              Teacher Panel
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5 flex-grow">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl font-medium transition-all text-left hover:translate-x-1 ${
                isActive(item.href)
                  ? "bg-brand-500/10 border border-brand-500/25 text-brand-400 shadow-md shadow-brand-500/5"
                  : "text-text-secondary hover:bg-bg-surface-elevated hover:text-white border border-transparent"
              }`}
            >
              {item.icon}
              <span className="text-sm">{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-border-strong pt-4 mt-auto">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3.5 w-full px-4 py-3 rounded-xl font-medium text-text-secondary hover:bg-rose-500/10 hover:text-rose-400 transition-all text-left hover:translate-x-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow overflow-y-auto">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
