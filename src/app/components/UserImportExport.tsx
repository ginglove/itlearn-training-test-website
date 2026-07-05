"use client";

import { useRef, useState } from "react";

interface ImportResult {
  created: { username: string; fullName: string; email: string; temporaryPassword: string }[];
  updated: string[];
  skipped: { row: number; reason: string }[];
}

/** Export/import buttons for the admin teacher/student lists (.xlsx). */
export default function UserImportExport({
  role,
  onImported,
}: {
  role: "TEACHER" | "STUDENT";
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/v1/admin/users/import?role=${role}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        onImported();
      } else {
        setError(data.message || "Import failed.");
      }
    } catch {
      setError("Network error during import.");
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadCredentials = () => {
    if (!result) return;
    const lines = [
      "username,full_name,email,temporary_password",
      ...result.created.map((c) => `${c.username},"${c.fullName}",${c.email},${c.temporaryPassword}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${role.toLowerCase()}_credentials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex gap-2">
        <a
          href={`/api/v1/admin/users/export?role=${role}`}
          className="px-4 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-semibold transition-all"
        >
          Export .xlsx
        </a>
        <input type="file" accept=".xlsx" className="hidden" ref={fileRef} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isImporting}
          className="px-4 py-2.5 rounded-xl border border-sky-500/30 text-sky-400 hover:bg-sky-500/10 disabled:opacity-50 text-sm font-semibold transition-all"
        >
          {isImporting ? "Importing…" : "Import .xlsx"}
        </button>
      </div>

      {error && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-rose-400 mb-3">Import Failed</h2>
            <p className="text-text-secondary text-sm">{error}</p>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setError(null)}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-2">Import Complete</h2>
            <p className="text-text-secondary text-sm mb-4">
              {result.created.length} created · {result.updated.length} updated ·{" "}
              {result.skipped.length} skipped
            </p>
            <div className="overflow-y-auto flex-grow space-y-4">
              {result.created.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary font-mono uppercase tracking-wider mb-2">
                    New accounts — temporary passwords (shown once)
                  </p>
                  <div className="divide-y divide-border-strong border border-border-strong rounded-xl">
                    {result.created.map((c) => (
                      <div key={c.username} className="flex justify-between items-center px-3 py-2">
                        <div>
                          <p className="text-white text-sm">{c.fullName}</p>
                          <p className="text-text-tertiary text-xs font-mono">{c.username}</p>
                        </div>
                        <span className="font-mono text-emerald-400 text-sm select-all">
                          {c.temporaryPassword}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary font-mono uppercase tracking-wider mb-2">
                    Skipped rows
                  </p>
                  {result.skipped.map((sk, i) => (
                    <p key={i} className="text-rose-400 text-xs">
                      Row {sk.row}: {sk.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              {result.created.length > 0 && (
                <button
                  onClick={downloadCredentials}
                  className="px-4 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-semibold transition-all"
                >
                  Download credentials .csv
                </button>
              )}
              <button
                onClick={() => setResult(null)}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
