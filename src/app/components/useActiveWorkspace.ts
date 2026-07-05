"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "activeWorkspaceId";
const EVENT = "active-workspace-changed";

/**
 * Global workspace filter shared across the whole panel: pages append the
 * selected workspace id to their list requests so Active Exams, Completed
 * Exams, Manage Exams, Sessions and Students all reflect the chosen class.
 * Empty string = all workspaces.
 */
export function useActiveWorkspace(): [string, (id: string) => void] {
  const [id, setIdState] = useState("");

  useEffect(() => {
    const read = () => setIdState(localStorage.getItem(STORAGE_KEY) || "");
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setId = (value: string) => {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  };

  return [id, setId];
}

/** Appends the active-workspace filter to an API URL when one is selected. */
export function withWorkspaceParam(url: string, workspaceId: string): string {
  if (!workspaceId) return url;
  return url + (url.includes("?") ? "&" : "?") + "workspaceId=" + encodeURIComponent(workspaceId);
}
