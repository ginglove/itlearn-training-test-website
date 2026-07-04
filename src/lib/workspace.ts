import { db } from "@/db";
import { workspaces, workspaceMemberships, workspaceTeachers } from "@/db/schema";
import { and, eq, exists, or, sql } from "drizzle-orm";

/** Condition: teacher created the workspace or is assigned via workspace_teachers (RSD v9 §2.3). */
export function teacherAssignedCondition(teacherId: string) {
  return or(
    eq(workspaces.createdBy, teacherId),
    exists(
      db
        .select({ one: sql`1` })
        .from(workspaceTeachers)
        .where(
          and(
            eq(workspaceTeachers.workspaceId, workspaces.id),
            eq(workspaceTeachers.teacherId, teacherId)
          )
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
