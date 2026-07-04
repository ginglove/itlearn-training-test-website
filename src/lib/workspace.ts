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

/** Fetch a workspace the teacher created or is assigned to, or null. */
export async function getOwnedWorkspace(teacherId: string, workspaceId: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), teacherAssignedCondition(teacherId)))
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
