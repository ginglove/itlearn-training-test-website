import { db } from "@/db";
import { workspaceActivities, workspaceMemberships } from "@/db/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

// Rule W1: an exam linked to any workspace via workspace_activities is only
// accessible to ACTIVE members of one of those workspaces, regardless of the
// exam's global access_type.

export async function checkWorkspaceExamAccess(
  examId: string,
  studentId: string
): Promise<{ workspaceLinked: boolean; isMember: boolean }> {
  const activities = await db
    .select({ workspaceId: workspaceActivities.workspaceId })
    .from(workspaceActivities)
    .where(eq(workspaceActivities.examId, examId));

  if (activities.length === 0) {
    return { workspaceLinked: false, isMember: false };
  }

  const workspaceIds = [...new Set(activities.map((a) => a.workspaceId))];
  const [membership] = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.studentId, studentId),
        eq(workspaceMemberships.status, "ACTIVE"),
        inArray(workspaceMemberships.workspaceId, workspaceIds)
      )
    )
    .limit(1);

  return { workspaceLinked: true, isMember: !!membership };
}

// Bulk variant for the exam listing: returns every workspace-linked exam id and
// the subset the student may access as an ACTIVE member.
export async function getWorkspaceExamAccess(
  studentId: string
): Promise<{ linkedExamIds: Set<string>; accessibleExamIds: Set<string> }> {
  const activities = await db
    .select({
      examId: workspaceActivities.examId,
      workspaceId: workspaceActivities.workspaceId,
    })
    .from(workspaceActivities)
    .where(isNotNull(workspaceActivities.examId));

  const linkedExamIds = new Set<string>();
  const accessibleExamIds = new Set<string>();
  if (activities.length === 0) {
    return { linkedExamIds, accessibleExamIds };
  }

  const memberships = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.studentId, studentId),
        eq(workspaceMemberships.status, "ACTIVE")
      )
    );
  const memberWorkspaceIds = new Set(memberships.map((m) => m.workspaceId));

  for (const activity of activities) {
    const examId = activity.examId!;
    linkedExamIds.add(examId);
    if (memberWorkspaceIds.has(activity.workspaceId)) {
      accessibleExamIds.add(examId);
    }
  }

  return { linkedExamIds, accessibleExamIds };
}
