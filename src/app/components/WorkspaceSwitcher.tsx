"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useActiveWorkspace } from "./useActiveWorkspace";

/**
 * Dropdown to jump between the workspaces the current user studies/teaches in.
 * The "menu" variant also drives the global workspace filter (all lists across
 * the panel scope to the chosen class); "inline" sits next to a page title.
 */
export default function WorkspaceSwitcher({
  currentId,
  listUrl,
  basePath,
  variant = "inline",
}: {
  currentId?: string;
  listUrl: string;
  basePath: string;
  variant?: "inline" | "menu";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeId, setActiveId] = useActiveWorkspace();
  const [options, setOptions] = useState<{ id: string; name: string; status: string }[]>([]);

  useEffect(() => {
    fetch(listUrl)
      .then((r) => (r.ok ? r.json() : { workspaces: [] }))
      .then((d) =>
        setOptions(
          (d.workspaces || []).map((w: any) => ({ id: w.id, name: w.name, status: w.status }))
        )
      )
      .catch(() => {});
  }, [listUrl]);

  if (variant === "inline") {
    if (options.length <= 1) return null;
    return (
      <select
        value={currentId ?? ""}
        onChange={(e) => e.target.value && router.push(`${basePath}/${e.target.value}`)}
        className="bg-bg-surface border border-border-strong rounded-xl px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none max-w-[260px]"
        title="Switch workspace"
      >
        {options.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.status === "ARCHIVED" ? " (archived)" : ""}
          </option>
        ))}
      </select>
    );
  }

  // Menu variant: global class filter shown at the top of the sidebar
  if (options.length === 0) return null;
  const selected = options.find((w) => w.id === activeId);

  const handleChange = (value: string) => {
    setActiveId(value);
    // If currently inside a workspace detail, follow the selection there
    if (value && pathname.startsWith(basePath + "/")) {
      router.push(`${basePath}/${value}`);
    }
  };

  return (
    <div className="mb-6 p-3 rounded-2xl bg-bg-surface-elevated/60 border border-border-strong">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
        </svg>
        <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-widest">
          My Classes
        </span>
        {selected && (
          <span
            className={`ml-auto w-2 h-2 rounded-full ${
              selected.status === "ACTIVE" ? "bg-emerald-400" : "bg-text-tertiary"
            }`}
            title={selected.status}
          />
        )}
      </div>
      <select
        value={activeId}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full bg-bg-base border border-border-strong rounded-xl pl-3 pr-7 py-2 text-xs text-white focus:border-brand-500 focus:outline-none cursor-pointer truncate"
        title={selected ? selected.name : "Filter the whole panel by class"}
      >
        <option value="">All classes</option>
        {options.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.status === "ARCHIVED" ? " (archived)" : ""}
          </option>
        ))}
      </select>
      {selected && (
        <div className="mt-2.5 px-0.5">
          <p className="text-white text-xs font-medium leading-snug break-words">
            {selected.name}
          </p>
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
                selected.status === "ACTIVE"
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-bg-surface-elevated border-border-strong text-text-tertiary"
              }`}
            >
              {selected.status}
            </span>
            {basePath && (
              <button
                onClick={() => router.push(`${basePath}/${selected.id}`)}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors whitespace-nowrap"
              >
                Open workspace →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
