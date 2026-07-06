"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/toast";
import WorkspaceSwitcher from "@/app/components/WorkspaceSwitcher";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Admins reach these pages via the /admin/exams and /admin/sessions rewrites;
  // show them the Admin Panel chrome instead of the teacher chrome.
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      const admin = user?.role === "ADMIN";
      setIsAdminUser(admin);
      // Admins have no class filter UI here — clear any leftover selection so
      // Manage Exams / Session Monitor always show everything
      if (admin && localStorage.getItem("activeWorkspaceId")) {
        localStorage.removeItem("activeWorkspaceId");
        window.dispatchEvent(new Event("active-workspace-changed"));
      }
    } catch {
      setIsAdminUser(false);
    }
  }, []);

  const handleLogout = () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    localStorage.removeItem("user");
    router.push("/login");
  };

  const adminIcon = (d: string) => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
  // Mirrors the Admin Panel sidebar so navigation stays identical when admins
  // browse the exam pages served under /admin/exams and /admin/sessions
  const adminNavItems = [
    {
      name: "Workspace Governance",
      href: "/admin",
      icon: adminIcon("M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"),
    },
    {
      name: "Manage Teachers",
      href: "/admin/teachers",
      icon: adminIcon("M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"),
    },
    {
      name: "Manage Students",
      href: "/admin/students",
      icon: adminIcon("M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"),
    },
    {
      name: "Manage Exams",
      href: "/admin/exams",
      icon: adminIcon("M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"),
    },
    {
      name: "Live Quiz",
      href: "/teacher/live",
      icon: adminIcon("M13 10V3L4 14h7v7l9-11h-7z"),
    },
    {
      name: "Session Monitor",
      href: "/admin/sessions",
      icon: adminIcon("M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"),
    },
    {
      name: "Admin Settings",
      href: "/admin/settings",
      icon: adminIcon("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"),
    },
  ];

  const teacherNavItems = [
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
      name: "Live Quiz",
      href: "/teacher/live",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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

  const navItems = isAdminUser ? adminNavItems : teacherNavItems;
  const panelLabel = isAdminUser ? "Admin Panel" : "Teacher Panel";

  const currentWorkspaceId = pathname.match(/^\/teacher\/workspaces\/([^/]+)/)?.[1];
  const workspaceMenu = !isAdminUser ? (
    <WorkspaceSwitcher
      variant="menu"
      currentId={currentWorkspaceId}
      listUrl="/api/v1/teacher/workspaces"
      basePath="/teacher/workspaces"
    />
  ) : null;

  const isActive = (href: string) => {
    if (href === "/teacher" || href === "/admin") return pathname === href;
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
            <span className="text-[8px] text-text-tertiary font-mono uppercase tracking-widest leading-none mt-0.5 block">{panelLabel}</span>
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
            {workspaceMenu}
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
              {panelLabel}
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5 flex-grow">
          {workspaceMenu}
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
