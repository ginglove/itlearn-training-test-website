"use client";

import { useState, useEffect } from "react";

export default function TeacherSettingsPage() {
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError("");
      const res = await fetch("/api/v1/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      if (data.status === "SUCCESS") {
        setSettings(data.settings);
      }
    } catch (err) {
      setError("Failed to fetch settings from the database.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error("Failed to update settings");
      const data = await res.json();
      if (data.status === "SUCCESS") {
        setSuccess("Platform settings updated successfully!");
        setSettings(data.settings);
      } else {
        setError(data.message || "Failed to update settings");
      }
    } catch (err) {
      setError("Network error occurred while saving settings.");
    } finally {
      setIsSaving(false);
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
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Platform Settings</h1>
            <p className="text-text-secondary">Configure global platform preferences and integrations.</p>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-xl mb-6">
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="grid grid-cols-1 gap-6">
          {/* Code Execution Section */}
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-white mb-1">Code Execution Engine</h2>
            <p className="text-text-secondary text-sm mb-6">
              The platform uses the Piston API for sandboxed code execution. Provide your custom Piston instance endpoint.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-2">
                    Execution Mode
                  </label>
                  <select
                    value={settings.executionMode}
                    onChange={(e) =>
                      setSettings({ ...settings, executionMode: e.target.value })
                    }
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
                    onChange={(e) =>
                      setSettings({ ...settings, pistonApiUrl: e.target.value })
                    }
                    className="premium-input font-mono text-sm disabled:opacity-50"
                    placeholder="https://emkc.org/api/v2/piston"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4">
                  <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
                    Queue Backend
                  </p>
                  <p className="text-white font-mono">{settings.queueBackend}</p>
                </div>
                <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4">
                  <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
                    Database Driver
                  </p>
                  <p className="text-white font-mono">Neon Postgres / Drizzle</p>
                </div>
              </div>
            </div>
          </div>

          {/* Security & Authentication Section */}
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-white mb-1">Security & Authentication</h2>
            <p className="text-text-secondary text-sm mb-6">
              Configure session constraints, IP validation, and credentials enforcement.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* IP Binding Toggle */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30 hover:bg-bg-surface-elevated/50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={settings.ipBinding}
                  onChange={(e) =>
                    setSettings({ ...settings, ipBinding: e.target.checked })
                  }
                  className="w-5 h-5 mt-0.5 rounded border-border-strong bg-bg-base text-brand-500 focus:ring-brand-500/50"
                />
                <div>
                  <span className="text-sm font-semibold text-white block mb-0.5">Session IP Binding</span>
                  <span className="text-xs text-text-secondary">
                    Require students to remain on the same IP address during their active exam session.
                  </span>
                </div>
              </label>

              {/* Password Reset Toggle */}
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
                  <span className="text-sm font-semibold text-white block mb-0.5">Enforce First Login Password Reset</span>
                  <span className="text-xs text-text-secondary">
                    Force students to change their generated temporary passwords immediately upon their first login.
                  </span>
                </div>
              </label>
            </div>
            <div className="bg-bg-surface-elevated border border-border-strong rounded-xl p-4 text-sm">
              <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
                Session Token Encryption
              </p>
              <p className="text-emerald-400 font-medium">{settings.sessionType}</p>
            </div>
          </div>

          {/* Anti-Cheat Section */}
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-white mb-1">Anti-Cheat & Workspace Controls</h2>
            <p className="text-text-secondary text-sm mb-6">
              Track student focus losses (window blur) and determine how frequently student workspaces auto-save.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Focus Loss Toggle */}
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
                  <span className="text-sm font-semibold text-white block mb-0.5">Track Tab Switches (Blur Events)</span>
                  <span className="text-xs text-text-secondary">
                    Record focus losses and alert the teacher in the active monitoring control room when student leaves page.
                  </span>
                </div>
              </label>

              {/* Auto-Save Interval Input */}
              <div className="p-4 rounded-xl border border-border-strong bg-bg-surface-elevated/30">
                <label className="block text-sm font-semibold text-white mb-1">
                  Auto-Save Interval (Seconds)
                </label>
                <p className="text-xs text-text-secondary mb-3">
                  How often draft code is saved and synchronized with the database.
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
          </div>

          {/* Action Button Row */}
          <div className="flex justify-end gap-4 mt-4">
            <button
              type="button"
              onClick={fetchSettings}
              className="premium-btn-secondary"
              disabled={isSaving}
            >
              Reset
            </button>
            <button
              type="submit"
              className="premium-btn-primary min-w-[160px]"
              disabled={isSaving}
            >
              {isSaving ? "Saving Settings..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
