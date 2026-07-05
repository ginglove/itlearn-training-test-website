import { db } from "@/db";
import { workspaces, workspaceMemberships, workspaceTeachers } from "@/db/schema";
import { and, eq, exists, sql } from "drizzle-orm";

/** Distinct ACTIVE-member student ids across all workspaces assigned to the teacher. */
export async function getTeacherScopedStudentIds(teacherId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ studentId: workspaceMemberships.studentId })
    .from(workspaceMemberships)
    .innerJoin(
      workspaceTeachers,
      eq(workspaceTeachers.workspaceId, workspaceMemberships.workspaceId)
    )
    .where(
      and(
        eq(workspaceTeachers.teacherId, teacherId),
        eq(workspaceMemberships.status, "ACTIVE")
      )
    );
  return rows.map((r) => r.studentId);
}

/**
 * Condition: teacher is assigned to the workspace via workspace_teachers (RSD v9 §4.4).
 * Assignment is the only access path — workspace creation is admin-only, and
 * migration 0009 backfilled legacy creators as assignees.
 */
export function teacherAssignedCondition(teacherId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(workspaceTeachers)
      .where(
        and(
          eq(workspaceTeachers.workspaceId, workspaces.id),
          eq(workspaceTeachers.teacherId, teacherId)
        )
      )
  );
}

/**
 * Fetch a workspace the teacher is assigned to, or null.
 * Admins (isAdminUser) can manage any workspace (§2.3 access matrix).
 */
export async function getOwnedWorkspace(
  teacherId: string,
  workspaceId: string,
  isAdminUser = false
) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(
      isAdminUser
        ? eq(workspaces.id, workspaceId)
        : and(eq(workspaces.id, workspaceId), teacherAssignedCondition(teacherId))
    )
    .limit(1);
  return ws ?? null;
}

/** Fetch a workspace the student is an ACTIVE member of, or null. */
export async function getMemberWorkspace(studentId: string, workspaceId: string) {
  const [row] = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.studentId, studentId),
        eq(workspaceMemberships.status, "ACTIVE")
      )
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.workspace ?? null;
}


const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Generate the remaining teaching days for a workspace from its schedule:
 * walks forward from start_date (or the day after the last scheduled day),
 * picking dates whose weekday is in schedule_days, until the timetable has
 * total_days entries. Existing dates are never duplicated.
 * Returns the number of days created.
 */
export async function generateTimetableDays(workspaceId: string): Promise<number> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws || !ws.startDate || !ws.totalDays || !ws.scheduleDays?.length) return 0;

  const { teachingDays } = await import("@/db/schema");
  const existing = await db
    .select({ dayNumber: teachingDays.dayNumber, scheduledDate: teachingDays.scheduledDate })
    .from(teachingDays)
    .where(eq(teachingDays.workspaceId, workspaceId));

  const missing = ws.totalDays - existing.length;
  if (missing <= 0) return 0;

  const usedDates = new Set(existing.map((d) => d.scheduledDate));
  let nextNumber = existing.reduce((max, d) => Math.max(max, d.dayNumber), 0) + 1;

  // Start from the later of start_date and the day after the last scheduled day
  const [sy, sm, sd] = ws.startDate.split("-").map(Number);
  let cursor = new Date(sy, sm - 1, sd);
  const lastExisting = [...usedDates].sort().pop();
  if (lastExisting && lastExisting >= ws.startDate) {
    const [ly, lm, ld] = lastExisting.split("-").map(Number);
    cursor = new Date(ly, lm - 1, ld);
    cursor.setDate(cursor.getDate() + 1);
  }

  const weekdays = new Set(ws.scheduleDays);
  const rows: { workspaceId: string; dayNumber: number; scheduledDate: string }[] = [];
  // Hard iteration cap so a bad schedule can never loop forever (~4 years)
  for (let i = 0; i < 1500 && rows.length < missing; i++) {
    if (weekdays.has(cursor.getDay())) {
      const iso = toISODate(cursor);
      if (!usedDates.has(iso)) {
        rows.push({ workspaceId, dayNumber: nextNumber++, scheduledDate: iso });
        usedDates.add(iso);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (rows.length > 0) {
    await db.insert(teachingDays).values(rows);
  }
  return rows.length;
}

/**
 * Append one makeup day after the last scheduled day (used when the teacher
 * is absent) so the class still reaches its planned number of taught days.
 * Falls back to day-by-day search when no schedule is configured.
 */
export async function appendMakeupDay(workspaceId: string): Promise<string | null> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) return null;
  const { teachingDays } = await import("@/db/schema");

  const existing = await db
    .select({ dayNumber: teachingDays.dayNumber, scheduledDate: teachingDays.scheduledDate })
    .from(teachingDays)
    .where(eq(teachingDays.workspaceId, workspaceId));
  if (existing.length === 0) return null;

  const usedDates = new Set(existing.map((d) => d.scheduledDate));
  const nextNumber = existing.reduce((max, d) => Math.max(max, d.dayNumber), 0) + 1;
  const last = [...usedDates].sort().pop()!;
  const [ly, lm, ld] = last.split("-").map(Number);
  const cursor = new Date(ly, lm - 1, ld);

  const weekdays = ws.scheduleDays?.length ? new Set(ws.scheduleDays) : null;
  for (let i = 0; i < 1500; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (weekdays && !weekdays.has(cursor.getDay())) continue;
    const iso = toISODate(cursor);
    if (usedDates.has(iso)) continue;
    await db.insert(teachingDays).values({
      workspaceId,
      dayNumber: nextNumber,
      scheduledDate: iso,
      topic: "Makeup day (teacher absence)",
    });
    return iso;
  }
  return null;
}
