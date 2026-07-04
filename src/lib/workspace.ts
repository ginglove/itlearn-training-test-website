import { db } from "@/db";
import { workspaces, workspaceMemberships } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Fetch a workspace owned by the given teacher, or null. */
export async function getOwnedWorkspace(teacherId: string, workspaceId: string) {
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.createdBy, teacherId)))
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
