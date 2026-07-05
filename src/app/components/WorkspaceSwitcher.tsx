"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dropdown to jump between the workspaces the current user studies/teaches in.
 * `listUrl` is the role-scoped list endpoint and `basePath` the detail route
 * prefix (e.g. /student/workspaces or /teacher/workspaces).
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
  /** "inline" sits next to a page title; "menu" renders a sidebar block. */
  variant?: "inline" | "menu";
}) {
  const router = useRouter();
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

  if (variant === "inline" && options.length <= 1) return null;
  if (variant === "menu" && options.length === 0) return null;

  const select = (
    <select
      value={currentId ?? ""}
      onChange={(e) => e.target.value && router.push(`${basePath}/${e.target.value}`)}
      className={
        variant === "menu"
          ? "w-full bg-bg-surface-elevated border border-border-strong rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none cursor-pointer"
          : "bg-bg-surface border border-border-strong rounded-xl px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none max-w-[260px]"
      }
      title="Switch workspace"
    >
      {currentId === undefined && (
        <option value="" disabled>
          Go to workspace…
        </option>
      )}
      {options.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.status === "ARCHIVED" ? " (archived)" : ""}
        </option>
      ))}
    </select>
  );

  if (variant === "menu") {
    return (
      <div className="mt-4 pt-4 border-t border-border-strong">
        <p className="text-[10px] text-text-tertiary font-mono uppercase tracking-widest mb-2 px-1">
          My Classes
        </p>
        {select}
      </div>
    );
  }
  return select;
}
