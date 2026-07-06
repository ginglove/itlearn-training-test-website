"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

export default function AdminSettingsPage() {
  const showToast = useToast();

  // Profile
  const [account, setAccount] = useState({ username: "", fullName: "", email: "" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Platform settings
  const [settings, setSettings] = useState({
    pistonApiUrl: "",
    queueBackend: "",
    sessionType: "",
    ipBinding: true,
    passwordResetEnforced: true,
    focusTrackingEnabled: true,
    autoSaveInterval: 15,
    executionMode: "LOCAL_FALLBACK",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/account").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v1/settings").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([accountData, settingsData]) => {
        if (accountData?.account) setAccount(accountData.account);
        if (settingsData?.settings) setSettings(settingsData.settings);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/v1/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: account.fullName, email: account.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.account);
        showToast("Profile updated successfully!");
      } else {
        showToast(data.message || "Failed to update profile", "error");
      }
    } catch {
      showToast("Network error while saving profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("New passwords do not match.", "error");
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/v1/admin/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        showToast("Password changed successfully!");
      } else {
        showToast(data.message || "Failed to change password", "error");
      }
    } catch {
      showToast("Network error while changing password.", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && data.status === "SUCCESS") {
        setSettings(data.settings);
        showToast("Platform settings updated successfully!");
      } else {
        showToast(data.message || "Failed to update settings", "error");
      }
    } catch {
      showToast("Network error while saving settings.", "error");
    } finally {
      setIsSavingSettings(false);
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Settings</h1>
          <p className="text-text-secondary">
            Manage your account credentials and configure global platform preferences.
          </p>
        </div>

        {/* ── Admin Profile ── */}
        <form onSubmit={saveProfile} className="glass-card p-4 sm:p-6 md:p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Account Information</h2>
          <p className="text-text-secondary text-sm mb-6">
            Update your display name and contact email. Username cannot be changed.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                Username
              </label>
              <input
                value={account.username}
                disabled
                className="premium-input font-mono text-sm opacity-50 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                Full Name
              </label>
              <input
                required
                minLength={2}
                maxLength={100}
                value={account.fullName}
                onChange={(e) => setAccount({ ...account, fullName: e.target.value })}
                className="premium-input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={account.email}
                onChange={(e) => setAccount({ ...account, email: e.target.value })}
                className="premium-input text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button type="submit" className="premium-btn-primary min-w-[160px]" disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        {/* ── Change Password ── */}
        <form onSubmit={changePassword} className="glass-card p-4 sm:p-6 md:p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Change Password</h2>
          <p className="text-text-secondary text-sm mb-6">
            Minimum 8 characters with at least one uppercase letter, one lowercase letter, one digit,
            and one special character.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                Current Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="premium-input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="premium-input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="premium-input text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button
              type="submit"
              className="premium-btn-primary min-w-[160px]"
              disabled={isChangingPassword}
            >
              {isChangingPassword ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>

        {/* ── Platform Settings ── */}
        <form onSubmit={saveSettings} className="grid grid-cols-1 gap-6">
          <div className="glass-card p-4 sm:p-6 md:p-8">
            <h2 className="text-xl font-bold text-white mb-1">Code Execution Engine</h2>
            <p className="text-text-secondary text-sm mb-6">
              The platform uses the Piston API for sandboxed code execution. Provide your custom
              Piston instance endpoint.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                  Execution Mode
                </label>
                <select
                  value={settings.executionMode}
                  onChange={(e) => setSettings({ ...settings, executionMode: e.target.value })}
                  className="premium-input bg-bg-surface-elevated text-white w-full border border-border-strong rounded-xl p-3 focus:outline-none focus:border-brand-500"
                >
                  <option value="LOCAL_FALLBACK">API with Local Fallback (Recommended)</option>
                  <option value="LOCAL_ONLY">Local Server Only</option>
                  <option value="API_ONLY">Piston API Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                  Piston API URL
                </label>
                <input
                  type="url"
                  required={settings.executionMode !== "LOCAL_ONLY"}
                  disabled={settings.executionMode === "LOCAL_ONLY"}
                  value={settings.pistonApiUrl}
                  onChange={(e) => setSettings({ ...settings, pistonApiUrl: e.target.value })}
                  className="premium-input font-mono text-sm disabled:opacity-50"
                  placeholder="https://emkc.org/api/v2/piston"
                />
              </div>
            </div>
          </div>

          <div className="glass-card p-4 sm:p-6 md:p-8">
            <h2 className="text-xl font-bold text-white mb-1">Security & Anti-Cheat</h2>
            <p className="text-text-secondary text-sm mb-6">
              Session constraints, credentials enforcement, and focus tracking.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <label className="flex items-start gap-4 p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30 hover:bg-bg-surface-elevated/50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={settings.ipBinding}
                  onChange={(e) => setSettings({ ...settings, ipBinding: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                />
                <div>
                  <span className="text-sm font-semibold text-white block mb-0.5">Session IP Binding</span>
                  <span className="text-xs text-text-secondary">
                    Require students to remain on the same IP address during their active exam session.
                  </span>
                </div>
              </label>
              <label className="flex items-start gap-4 p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30 hover:bg-bg-surface-elevated/50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={settings.passwordResetEnforced}
                  onChange={(e) =>
                    setSettings({ ...settings, passwordResetEnforced: e.target.checked })
                  }
                  className="w-5 h-5 mt-0.5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                />
                <div>
                  <span className="text-sm font-semibold text-white block mb-0.5">
                    Enforce First Login Password Reset
                  </span>
                  <span className="text-xs text-text-secondary">
                    Force users to change their generated temporary passwords immediately upon first login.
                  </span>
                </div>
              </label>
              <label className="flex items-start gap-4 p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30 hover:bg-bg-surface-elevated/50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={settings.focusTrackingEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, focusTrackingEnabled: e.target.checked })
                  }
                  className="w-5 h-5 mt-0.5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                />
                <div>
                  <span className="text-sm font-semibold text-white block mb-0.5">
                    Track Tab Switches (Blur Events)
                  </span>
                  <span className="text-xs text-text-secondary">
                    Record focus losses and alert the teacher in the live monitor when a student leaves the page.
                  </span>
                </div>
              </label>
              <div className="p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30">
                <label className="block text-sm font-semibold text-white mb-1">
                  Auto-Save Interval (Seconds)
                </label>
                <p className="text-xs text-text-secondary mb-3">
                  How often draft answers are saved and synchronized with the database.
                </p>
                <input
                  type="number"
                  required
                  min="5"
                  max="300"
                  value={settings.autoSaveInterval}
                  onChange={(e) =>
                    setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) })
                  }
                  className="premium-input w-full max-w-[150px] font-mono text-sm py-2 px-3"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4">
                <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">Queue Backend</p>
                <p className="text-white font-mono">{settings.queueBackend}</p>
              </div>
              <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4">
                <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
                  Session Token Encryption
                </p>
                <p className="text-emerald-400 font-medium">{settings.sessionType}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 mb-10">
            <button
              type="submit"
              className="premium-btn-primary min-w-[160px]"
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "Saving Settings..." : "Save Platform Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
