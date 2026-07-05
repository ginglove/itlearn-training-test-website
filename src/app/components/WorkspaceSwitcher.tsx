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
}: {
  currentId: string;
  listUrl: string;
  basePath: string;
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

  if (options.length <= 1) return null;

  return (
    <select
      value={currentId}
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
