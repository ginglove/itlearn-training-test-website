"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import DateTimePicker from "@/app/components/DateTimePicker";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalDays: number;
  startDate: string | null;
  endDate: string | null;
}
interface Member {
  membershipId: string;
  studentId: string;
  username: string;
  fullName: string;
  email: string;
  status: "ACTIVE" | "REMOVED";
}
interface TeachingDay {
  id: string;
  dayNumber: number;
  scheduledDate: string;
  topic: string | null;
  notes: string | null;
  hasRollCall: boolean;
}
interface Activity {
  id: string;
  activityType: "EXERCISE" | "HOMEWORK" | "ASSESSMENT" | "QUIZ";
  title: string;
  description: string | null;
  examId: string | null;
  examTitle: string | null;
  teachingDayId: string | null;
  dayNumber: number | null;
  dueDate: string | null;
}
interface RollCallRow {
  studentId: string;
  fullName: string;
  username: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;
  note: string | null;
}

const TYPE_BADGE: Record<string, string> = {
  EXERCISE: "bg-teal-500/10 border-teal-500/25 text-teal-400",
  HOMEWORK: "bg-purple-500/10 border-purple-500/25 text-purple-400",
  ASSESSMENT: "bg-rose-500/10 border-rose-500/25 text-rose-400",
  QUIZ: "bg-blue-500/10 border-blue-500/25 text-blue-400",
};
const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LATE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ABSENT: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  EXCUSED: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

type Tab = "members" | "timetable" | "rollcall" | "activities" | "attendance" | "analytics" | "report";

interface AnalyticsStudent {
  studentId: string;
  fullName: string;
  studentCode: string;
  daysStudied: number;
  attendanceRate: number;
  byType: Record<
    string,
    { assigned: number; attempts: number; passed: number; failed: number; averageScore: number | null }
  >;
}

export default function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [allStudents, setAllStudents] = useState<{ id: string; fullName: string; username: string }[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Timetable
  const [days, setDays] = useState<TeachingDay[]>([]);
  const [dayForm, setDayForm] = useState({ scheduledDate: "", topic: "", notes: "" });
  const [editDay, setEditDay] = useState<TeachingDay | null>(null);
  const [editDayForm, setEditDayForm] = useState({ scheduledDate: "", topic: "", notes: "" });

  // Roll call
  const [rollCallDayId, setRollCallDayId] = useState<string>("");
  const [rollCall, setRollCall] = useState<RollCallRow[]>([]);
  const [isSavingRollCall, setIsSavingRollCall] = useState(false);

  // Activities
  const [activities, setActivities] = useState<Activity[]>([]);
  const [exams, setExams] = useState<{ id: string; title: string }[]>([]);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [activityForm, setActivityForm] = useState({
    activityType: "EXERCISE",
    title: "",
    description: "",
    examIds: [] as string[],
    teachingDayId: "",
    dueDate: "",
  });

  // Attendance matrix
  const [matrix, setMatrix] = useState<{
    days: { id: string; dayNumber: number; scheduledDate: string }[];
    members: { studentId: string; fullName: string }[];
    matrix: Record<string, Record<string, string>>;
  } | null>(null);

  // Analytics (visual report)
  const [analytics, setAnalytics] = useState<{
    totalConductedDays: number;
    totalScheduledDays: number;
    students: AnalyticsStudent[];
  } | null>(null);

  // Report
  const [report, setReport] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const archived = workspace?.status === "ARCHIVED";

  const fetchWorkspace = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}`);
    if (res.ok) {
      const data = await res.json();
      setWorkspace(data.workspace);
    }
  }, [id]);

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/members`);
    if (res.ok) setMembers((await res.json()).members || []);
  }, [id]);

  const fetchDays = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable`);
    if (res.ok) setDays((await res.json()).teachingDays || []);
  }, [id]);

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/activities`);
    if (res.ok) setActivities((await res.json()).activities || []);
  }, [id]);

  const fetchMatrix = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/attendance`);
    if (res.ok) setMatrix(await res.json());
  }, [id]);

  const fetchAnalytics = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/analytics`);
    setAnalytics(res.ok ? await res.json() : null);
  }, [id]);

  const fetchReport = useCallback(async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/report`);
    setReport(res.ok ? (await res.json()).report : null);
  }, [id]);

  useEffect(() => {
    fetchWorkspace();
    fetchMembers();
    fetchDays();
    fetchActivities();
  }, [fetchWorkspace, fetchMembers, fetchDays, fetchActivities]);

  useEffect(() => {
    if (tab === "attendance") fetchMatrix();
    if (tab === "analytics") fetchAnalytics();
    if (tab === "report") fetchReport();
  }, [tab, fetchMatrix, fetchAnalytics, fetchReport]);

  // ── Members ──
  const openAddMember = async () => {
    const res = await fetch("/api/v1/teacher/students?scope=all");
    if (res.ok) {
      const data = await res.json();
      const memberIds = new Set(members.filter((m) => m.status === "ACTIVE").map((m) => m.studentId));
      setAllStudents((data.students || []).filter((s: any) => !memberIds.has(s.id)));
    }
    setSelectedStudents([]);
    setIsAddMemberOpen(true);
  };

  const addMembers = async () => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentIds: selectedStudents }),
    });
    const data = await res.json();
    if (res.ok) {
      setIsAddMemberOpen(false);
      notify("success", "Students added to workspace.");
      fetchMembers();
    } else {
      notify("error", data.message || "Failed to add students.");
    }
  };

  const removeMember = async (studentId: string) => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/members/${studentId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Student removed.");
      fetchMembers();
    } else {
      notify("error", data.message || "Failed to remove student.");
    }
  };

  const removeSelectedMembers = async () => {
    if (selectedMembers.length === 0) return;
    if (!confirm(`Remove ${selectedMembers.length} selected student(s) from this workspace?`)) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/members/bulk-remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentIds: selectedMembers }),
    });
    const data = await res.json();
    if (res.ok) {
      const blocked = data.blocked?.length ?? 0;
      notify(
        blocked ? "error" : "success",
        `Removed ${data.removed.length} student(s).` +
          (blocked ? ` ${blocked} skipped (existing submissions).` : "")
      );
      setSelectedMembers([]);
      fetchMembers();
    } else {
      notify("error", data.message || "Failed to remove students.");
    }
  };

  // ── Timetable ──
  const addDay = async () => {
    if (!dayForm.scheduledDate) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dayForm),
    });
    const data = await res.json();
    if (res.ok) {
      setDayForm({ scheduledDate: "", topic: "", notes: "" });
      fetchDays();
    } else {
      notify("error", data.message || "Failed to add teaching day.");
    }
  };

  const openEditDay = (d: TeachingDay) => {
    setEditDay(d);
    setEditDayForm({ scheduledDate: d.scheduledDate, topic: d.topic || "", notes: d.notes || "" });
  };

  const saveEditDay = async () => {
    if (!editDay) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable/${editDay.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDayForm),
    });
    const data = await res.json();
    if (res.ok) {
      setEditDay(null);
      // 5.2.3: surface the date-change warning when roll call already exists
      if (data.warning) notify("error", data.warning);
      else notify("success", "Teaching day updated.");
      fetchDays();
    } else {
      notify("error", data.message || "Failed to update teaching day.");
    }
  };

  const voidAttendance = async (dayId: string) => {
    if (!confirm("Void all attendance records for this day? This cannot be undone.")) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable/${dayId}/rollcall`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Attendance records voided.");
      fetchDays();
      if (rollCallDayId === dayId) loadRollCall(dayId);
    } else {
      notify("error", data.message || "Failed to void attendance.");
    }
  };

  const deleteDay = async (dayId: string) => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable/${dayId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) fetchDays();
    else notify("error", data.message || "Failed to delete teaching day.");
  };

  // ── Roll call ──
  const loadRollCall = async (dayId: string) => {
    setRollCallDayId(dayId);
    if (!dayId) return setRollCall([]);
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable/${dayId}/rollcall`);
    if (res.ok) setRollCall((await res.json()).rollCall || []);
  };

  const quickRollCall = () => {
    setRollCall((rows) => rows.map((r) => ({ ...r, status: r.status ?? "PRESENT" })));
  };

  const saveRollCall = async () => {
    const records = rollCall
      .filter((r) => r.status)
      .map((r) => ({ studentId: r.studentId, status: r.status, note: r.note || undefined }));
    if (records.length === 0) return notify("error", "Mark at least one student.");
    setIsSavingRollCall(true);
    try {
      const res = await fetch(`/api/v1/teacher/workspaces/${id}/timetable/${rollCallDayId}/rollcall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (res.ok) {
        notify("success", "Roll call saved.");
        fetchDays();
      } else {
        notify("error", data.message || "Failed to save roll call.");
      }
    } finally {
      setIsSavingRollCall(false);
    }
  };

  // ── Activities ──
  const openAssign = async () => {
    const res = await fetch("/api/v1/teacher/exams");
    if (res.ok) setExams((await res.json()).exams || []);
    setActivityForm({ activityType: "EXERCISE", title: "", description: "", examIds: [], teachingDayId: "", dueDate: "" });
    setIsAssignOpen(true);
  };

  const assignActivity = async () => {
    const bulk = activityForm.examIds.length > 0;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityType: activityForm.activityType,
        description: activityForm.description || undefined,
        teachingDayId: activityForm.teachingDayId || undefined,
        dueDate: activityForm.dueDate || undefined,
        ...(bulk
          ? { examIds: activityForm.examIds }
          : { title: activityForm.title }),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setIsAssignOpen(false);
      if (bulk) {
        const skipped = data.skipped?.length ?? 0;
        notify(
          skipped ? "error" : "success",
          `Assigned ${data.created?.length ?? 0} exam(s).` +
            (skipped ? ` ${skipped} skipped (duplicate or not found).` : "")
        );
      } else {
        notify("success", "Activity assigned.");
      }
      fetchActivities();
    } else {
      notify("error", data.message || "Failed to assign activity.");
    }
  };

  const removeActivity = async (activityId: string) => {
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/activities/${activityId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) fetchActivities();
    else notify("error", data.message || "Failed to remove activity.");
  };

  const removeSelectedActivities = async () => {
    if (selectedActivities.length === 0) return;
    if (!confirm(`Remove ${selectedActivities.length} selected activit(ies) from this workspace?`)) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/activities/bulk-remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityIds: selectedActivities }),
    });
    const data = await res.json();
    if (res.ok) {
      const blocked = data.blocked?.length ?? 0;
      notify(
        blocked ? "error" : "success",
        `Removed ${data.removed.length} activit(ies).` +
          (blocked ? ` ${blocked} skipped (existing submissions).` : "")
      );
      setSelectedActivities([]);
      fetchActivities();
    } else {
      notify("error", data.message || "Failed to remove activities.");
    }
  };

  // ── Archive & report ──
  const archiveWorkspace = async () => {
    if (!confirm("Archive this workspace? This is irreversible and makes it read-only.")) return;
    const res = await fetch(`/api/v1/teacher/workspaces/${id}/archive`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      notify("success", "Workspace archived.");
      fetchWorkspace();
    } else {
      const items = data.blockingItems ? `: ${data.blockingItems.join("; ")}` : "";
      notify("error", (data.message || "Archive failed") + items);
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const res = await fetch(`/api/v1/teacher/workspaces/${id}/report`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        notify("success", "Report generated.");
        fetchReport();
      } else {
        notify("error", data.message || "Failed to generate report.");
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const activeMembers = members.filter((m) => m.status === "ACTIVE");

  if (!workspace) {
    return <div className="p-10 text-text-secondary">Loading workspace…</div>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "members", label: `Members (${activeMembers.length})` },
    { key: "timetable", label: `Timetable (${days.length})` },
    { key: "rollcall", label: "Roll Call" },
    { key: "activities", label: `Activities (${activities.length})` },
    { key: "attendance", label: "Attendance" },
    { key: "analytics", label: "Analytics" },
    { key: "report", label: "Report" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <button
        onClick={() => router.push("/teacher/workspaces")}
        className="text-text-secondary hover:text-white text-sm mb-4 transition-colors"
      >
        ← Back to Workspaces
      </button>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-white">{workspace.name}</h1>
            <span
              className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
                archived
                  ? "bg-bg-surface-elevated border-border-strong text-text-tertiary"
                  : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              }`}
            >
              {workspace.status}
            </span>
          </div>
          {workspace.description && (
            <p className="text-text-secondary text-sm mt-1">{workspace.description}</p>
          )}
          <p className="text-text-tertiary text-xs font-mono mt-1">
            Planned {workspace.totalDays} days
            {workspace.startDate ? ` · ${workspace.startDate} → ${workspace.endDate || "?"}` : ""}
          </p>
        </div>
        {!archived && (
          <button
            onClick={archiveWorkspace}
            className="px-4 py-2 text-sm rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            Archive Workspace
          </button>
        )}
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl text-sm border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/25 text-rose-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === t.key
                ? "bg-brand-500/10 border-brand-500/25 text-brand-400"
                : "border-transparent text-text-secondary hover:text-white hover:bg-bg-surface-elevated"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Members tab ── */}
      {tab === "members" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-white">Enrolled Students</h2>
            {!archived && (
              <div className="flex gap-2">
                {selectedMembers.length > 0 && (
                  <button
                    onClick={removeSelectedMembers}
                    className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-semibold transition-all"
                  >
                    Remove Selected ({selectedMembers.length})
                  </button>
                )}
                <button
                  onClick={openAddMember}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  + Add Students
                </button>
              </div>
            )}
          </div>
          {activeMembers.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No students enrolled yet.</p>
          ) : (
            <div className="divide-y divide-border-strong">
              {activeMembers.map((m) => (
                <div key={m.membershipId} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {!archived && (
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(m.studentId)}
                        onChange={(e) =>
                          setSelectedMembers((prev) =>
                            e.target.checked
                              ? [...prev, m.studentId]
                              : prev.filter((x) => x !== m.studentId)
                          )
                        }
                        className="accent-brand-500"
                      />
                    )}
                    <div>
                      <p className="text-white text-sm">{m.fullName}</p>
                      <p className="text-text-tertiary text-xs font-mono">
                        {m.username} · {m.email}
                      </p>
                    </div>
                  </div>
                  {!archived && (
                    <button
                      onClick={() => removeMember(m.studentId)}
                      className="text-rose-400 hover:text-rose-300 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Timetable tab ── */}
      {tab === "timetable" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <h2 className="font-semibold text-white mb-4">Teaching Days</h2>
          {!archived && (
            <div className="flex flex-col md:flex-row gap-3 mb-5">
              <div className="md:w-56">
                <DateTimePicker
                  mode="date"
                  value={dayForm.scheduledDate}
                  onChange={(val) => setDayForm({ ...dayForm, scheduledDate: val })}
                />
              </div>
              <input
                placeholder="Topic (optional)"
                value={dayForm.topic}
                onChange={(e) => setDayForm({ ...dayForm, topic: e.target.value })}
                className="flex-grow bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={addDay}
                disabled={!dayForm.scheduledDate}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Add Day
              </button>
            </div>
          )}
          {days.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No teaching days yet.</p>
          ) : (
            <div className="divide-y divide-border-strong">
              {days.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4">
                    <span className="w-10 h-10 rounded-xl bg-bg-surface-elevated border border-border-strong flex items-center justify-center text-brand-400 font-mono text-sm shrink-0">
                      {d.dayNumber}
                    </span>
                    <div>
                      <p className="text-white text-sm">{d.scheduledDate}</p>
                      <p className="text-text-tertiary text-xs">{d.topic || "No topic"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {d.hasRollCall && (
                      <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                        ROLL CALL ✓
                      </span>
                    )}
                    {!archived && (
                      <button
                        onClick={() => openEditDay(d)}
                        className="text-text-secondary hover:text-white text-xs transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {!archived && d.hasRollCall && (
                      <button
                        onClick={() => voidAttendance(d.id)}
                        className="text-amber-400 hover:text-amber-300 text-xs transition-colors"
                      >
                        Void Attendance
                      </button>
                    )}
                    {!archived && !d.hasRollCall && (
                      <button
                        onClick={() => deleteDay(d.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Roll Call tab ── */}
      {tab === "rollcall" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
            <select
              value={rollCallDayId}
              onChange={(e) => loadRollCall(e.target.value)}
              className="bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
            >
              <option value="">Select a teaching day…</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  Day {d.dayNumber} — {d.scheduledDate} {d.hasRollCall ? "(recorded)" : ""}
                </option>
              ))}
            </select>
            {rollCallDayId && !archived && (
              <>
                <button
                  onClick={quickRollCall}
                  className="px-4 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm transition-all"
                >
                  Quick Roll Call (all present)
                </button>
                <button
                  onClick={saveRollCall}
                  disabled={isSavingRollCall}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all md:ml-auto"
                >
                  {isSavingRollCall ? "Saving…" : "Save Roll Call"}
                </button>
              </>
            )}
          </div>
          {rollCallDayId && (
            <div className="divide-y divide-border-strong">
              {rollCall.map((r, idx) => (
                <div key={r.studentId} className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-2">
                  <div>
                    <p className="text-white text-sm">{r.fullName}</p>
                    <p className="text-text-tertiary text-xs font-mono">{r.username}</p>
                  </div>
                  <div className="flex gap-2">
                    {ATTENDANCE_STATUSES.map((s) => (
                      <button
                        key={s}
                        disabled={archived}
                        onClick={() =>
                          setRollCall((rows) =>
                            rows.map((row, i) => (i === idx ? { ...row, status: s } : row))
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                          r.status === s
                            ? ATTENDANCE_COLORS[s]
                            : "border-border-strong text-text-tertiary hover:text-white"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {rollCall.length === 0 && (
                <p className="text-text-secondary text-sm py-8 text-center">No active students.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Activities tab ── */}
      {tab === "activities" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-white">Assigned Activities</h2>
            {!archived && (
              <div className="flex gap-2">
                {selectedActivities.length > 0 && (
                  <button
                    onClick={removeSelectedActivities}
                    className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-semibold transition-all"
                  >
                    Remove Selected ({selectedActivities.length})
                  </button>
                )}
                <button
                  onClick={openAssign}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  + Assign Activity
                </button>
              </div>
            )}
          </div>
          {activities.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No activities assigned.</p>
          ) : (
            <div className="space-y-6">
              {(["QUIZ", "ASSESSMENT", "HOMEWORK", "EXERCISE"] as const)
                .map((type) => ({ type, items: activities.filter((a) => a.activityType === type) }))
                .filter((g) => g.items.length > 0)
                .map((g) => (
              <div key={g.type}>
                <h3 className="text-xs font-semibold text-text-tertiary font-mono uppercase tracking-wider mb-1">
                  {g.type} ({g.items.length})
                </h3>
                <div className="divide-y divide-border-strong">
              {g.items.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {!archived && (
                      <input
                        type="checkbox"
                        checked={selectedActivities.includes(a.id)}
                        onChange={(e) =>
                          setSelectedActivities((prev) =>
                            e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)
                          )
                        }
                        className="accent-brand-500"
                      />
                    )}
                    <span
                      className={`text-[10px] font-mono px-2 py-1 rounded-full border shrink-0 ${TYPE_BADGE[a.activityType]}`}
                    >
                      {a.activityType}
                    </span>
                    <div>
                      <p className="text-white text-sm">{a.title}</p>
                      <p className="text-text-tertiary text-xs">
                        {a.examTitle ? `Exam: ${a.examTitle}` : "Standalone task"}
                        {a.dayNumber ? ` · Day ${a.dayNumber}` : ""}
                        {a.dueDate ? ` · due ${new Date(a.dueDate).toLocaleString()}` : ""}
                      </p>
                    </div>
                  </div>
                  {!archived && (
                    <button
                      onClick={() => removeActivity(a.id)}
                      className="text-rose-400 hover:text-rose-300 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
                </div>
              </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Attendance matrix tab ── */}
      {tab === "attendance" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5 overflow-x-auto">
          <h2 className="font-semibold text-white mb-4">Attendance Matrix</h2>
          {!matrix || matrix.members.length === 0 || matrix.days.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">
              No attendance data yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs font-mono">
                  <th className="text-left py-2 pr-4">Student</th>
                  {matrix.days.map((d) => (
                    <th key={d.id} className="px-2 py-2 text-center" title={d.scheduledDate}>
                      D{d.dayNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.members.map((m) => (
                  <tr key={m.studentId} className="border-t border-border-strong">
                    <td className="py-2 pr-4 text-white whitespace-nowrap">{m.fullName}</td>
                    {matrix.days.map((d) => {
                      const status = matrix.matrix[m.studentId]?.[d.id];
                      return (
                        <td key={d.id} className="px-2 py-2 text-center">
                          {status ? (
                            <span
                              className={`inline-block w-7 text-[10px] font-mono py-0.5 rounded border ${ATTENDANCE_COLORS[status]}`}
                            >
                              {status[0]}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Analytics (visual report) tab ── */}
      {tab === "analytics" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-white">Student Performance Analytics</h2>
            {analytics && (
              <span className="text-text-tertiary text-xs font-mono">
                {analytics.totalConductedDays}/{analytics.totalScheduledDays} days conducted
              </span>
            )}
          </div>
          {!analytics || analytics.students.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No data yet.</p>
          ) : (
            <div className="space-y-4">
              {analytics.students.map((st) => (
                <div key={st.studentId} className="bg-bg-base border border-border-strong rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="text-white text-sm font-semibold">{st.fullName}</p>
                      <p className="text-text-tertiary text-xs font-mono">{st.studentCode}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary">
                        Days studied:{" "}
                        <span className="text-white font-mono">
                          {st.daysStudied}/{analytics.totalConductedDays}
                        </span>
                      </span>
                      <div className="w-28 h-2 bg-bg-surface-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, st.attendanceRate)}%` }}
                        />
                      </div>
                      <span className="text-emerald-400 text-xs font-mono w-12">
                        {st.attendanceRate}%
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(["QUIZ", "ASSESSMENT", "HOMEWORK", "EXERCISE"] as const).map((type) => {
                      const t = st.byType[type];
                      if (!t || t.assigned === 0) return (
                        <div key={type} className="border border-border-strong/50 rounded-lg p-3 opacity-40">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${TYPE_BADGE[type]}`}>
                            {type}
                          </span>
                          <p className="text-text-tertiary text-xs mt-2">No activities</p>
                        </div>
                      );
                      return (
                        <div key={type} className="border border-border-strong rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${TYPE_BADGE[type]}`}>
                              {type}
                            </span>
                            <span className="text-text-tertiary text-[10px] font-mono">
                              {t.attempts}/{t.assigned} done
                            </span>
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <div className="text-xs space-y-0.5">
                              <p className="text-emerald-400 font-mono">✓ {t.passed} pass</p>
                              <p className="text-rose-400 font-mono">✗ {t.failed} fail</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-white font-mono leading-none">
                                {t.averageScore !== null ? `${t.averageScore}%` : "—"}
                              </p>
                              <p className="text-text-tertiary text-[10px] mt-0.5">avg score</p>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-bg-surface-elevated rounded-full overflow-hidden mt-2">
                            <div
                              className={`h-full rounded-full ${
                                (t.averageScore ?? 0) >= 50 ? "bg-emerald-500" : "bg-rose-500"
                              }`}
                              style={{ width: `${Math.min(100, t.averageScore ?? 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Report tab ── */}
      {tab === "report" && (
        <div className="bg-bg-surface border border-border-strong rounded-2xl p-5">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-5">
            <h2 className="font-semibold text-white">End-of-Class Report</h2>
            <div className="flex gap-3">
              <button
                onClick={generateReport}
                disabled={!archived || isGeneratingReport}
                title={!archived ? "Archive the workspace first" : ""}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
              >
                {isGeneratingReport ? "Generating…" : report ? "Regenerate Report" : "Generate Report"}
              </button>
              {report && (
                <a
                  href={`/api/v1/teacher/workspaces/${id}/report/export`}
                  className="px-4 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm transition-all"
                >
                  Export .xlsx
                </a>
              )}
            </div>
          </div>
          {!archived && (
            <p className="text-text-secondary text-sm mb-4">
              The workspace must be archived before a report can be generated.
            </p>
          )}
          {report?.reportData && (
            <div className="overflow-x-auto">
              <p className="text-text-tertiary text-xs font-mono mb-3">
                Generated {new Date(report.generatedAt).toLocaleString()} · conducted{" "}
                {report.totalConductedDays}/{report.totalScheduledDays} days
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-tertiary text-xs font-mono text-left">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 px-2">Attendance</th>
                    <th className="py-2 px-2">Submitted</th>
                    <th className="py-2 px-2">Avg</th>
                    <th className="py-2 px-2">High</th>
                    <th className="py-2 px-2">Low</th>
                  </tr>
                </thead>
                <tbody>
                  {report.reportData.students.map((s: any) => (
                    <tr key={s.studentId} className="border-t border-border-strong">
                      <td className="py-2 pr-4 text-white">{s.fullName}</td>
                      <td className="py-2 px-2 text-text-secondary">
                        {s.attendance.attendanceRate}%
                      </td>
                      <td className="py-2 px-2 text-text-secondary">
                        {s.summary.submittedCount}/{s.summary.totalActivities}
                      </td>
                      <td className="py-2 px-2 text-text-secondary">{s.summary.averageScore ?? "—"}</td>
                      <td className="py-2 px-2 text-text-secondary">{s.summary.highestScore ?? "—"}</td>
                      <td className="py-2 px-2 text-text-secondary">{s.summary.lowestScore ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add members modal ── */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">Add Students</h2>
            <div className="overflow-y-auto flex-grow divide-y divide-border-strong">
              {allStudents.length === 0 ? (
                <p className="text-text-secondary text-sm py-8 text-center">
                  All students are already enrolled.
                </p>
              ) : (
                allStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(s.id)}
                      onChange={(e) =>
                        setSelectedStudents((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                        )
                      }
                      className="accent-brand-500"
                    />
                    <div>
                      <p className="text-white text-sm">{s.fullName}</p>
                      <p className="text-text-tertiary text-xs font-mono">{s.username}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setIsAddMemberOpen(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMembers}
                disabled={selectedStudents.length === 0}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Add {selectedStudents.length || ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit teaching day modal ── */}
      {editDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">
              Edit Day {editDay.dayNumber}
            </h2>
            {editDay.hasRollCall && (
              <p className="mb-4 px-3 py-2 rounded-xl text-xs bg-amber-500/10 border border-amber-500/25 text-amber-400">
                Roll call records exist for this day. Changing the date does not alter existing
                attendance records.
              </p>
            )}
            <div className="space-y-4">
              <DateTimePicker
                mode="date"
                label="Date"
                required
                value={editDayForm.scheduledDate}
                onChange={(val) => setEditDayForm({ ...editDayForm, scheduledDate: val })}
              />
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Topic</label>
                <input
                  value={editDayForm.topic}
                  onChange={(e) => setEditDayForm({ ...editDayForm, topic: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Notes</label>
                <textarea
                  value={editDayForm.notes}
                  onChange={(e) => setEditDayForm({ ...editDayForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditDay(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditDay}
                disabled={!editDayForm.scheduledDate}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign activity modal ── */}
      {isAssignOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-strong rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Assign Activity</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Type *</label>
                <select
                  value={activityForm.activityType}
                  onChange={(e) => setActivityForm({ ...activityForm, activityType: e.target.value })}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="EXERCISE">Exercise</option>
                  <option value="HOMEWORK">Homework</option>
                  <option value="QUIZ">Quiz</option>
                  <option value="ASSESSMENT">Assessment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">
                  Exams{" "}
                  {["QUIZ", "ASSESSMENT"].includes(activityForm.activityType)
                    ? "* (select one or more)"
                    : "(optional — select to create one activity per exam)"}
                </label>
                <div className="max-h-40 overflow-y-auto border border-border-strong rounded-xl divide-y divide-border-strong bg-bg-base">
                  {exams.length === 0 && (
                    <p className="text-text-tertiary text-xs px-4 py-3">No exams available.</p>
                  )}
                  {exams.map((ex) => (
                    <label key={ex.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-bg-surface-elevated/40">
                      <input
                        type="checkbox"
                        checked={activityForm.examIds.includes(ex.id)}
                        onChange={(e) =>
                          setActivityForm((prev) => ({
                            ...prev,
                            examIds: e.target.checked
                              ? [...prev.examIds, ex.id]
                              : prev.examIds.filter((x) => x !== ex.id),
                          }))
                        }
                        className="accent-brand-500"
                      />
                      <span className="text-white text-sm truncate">{ex.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              {activityForm.examIds.length === 0 ? (
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Title *</label>
                  <input
                    value={activityForm.title}
                    onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                    className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              ) : (
                <p className="text-text-tertiary text-xs">
                  {activityForm.examIds.length} activit(ies) will be created, titled after each exam.
                </p>
              )}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Description</label>
                <textarea
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-bg-base border border-border-strong rounded-xl px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Teaching Day</label>
                  <select
                    value={activityForm.teachingDayId}
                    onChange={(e) => setActivityForm({ ...activityForm, teachingDayId: e.target.value })}
                    className="w-full bg-bg-base border border-border-strong rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {days.map((d) => (
                      <option key={d.id} value={d.id}>
                        Day {d.dayNumber} ({d.scheduledDate})
                      </option>
                    ))}
                  </select>
                </div>
                <DateTimePicker
                  label="Due Date"
                  value={activityForm.dueDate}
                  onChange={(val) => setActivityForm({ ...activityForm, dueDate: val })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsAssignOpen(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={assignActivity}
                disabled={
                  activityForm.examIds.length === 0
                    ? !activityForm.title.trim() ||
                      ["QUIZ", "ASSESSMENT"].includes(activityForm.activityType)
                    : false
                }
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
