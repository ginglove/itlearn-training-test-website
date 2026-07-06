import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, workspaceMemberships, examSubmissions } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// POST — remove multiple activities in one action.
// Activities whose exams already have submissions from workspace members are
// skipped (§7.2.6) and reported.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const activityIds: string[] = Array.isArray(body.activityIds) ? body.activityIds : [];
    if (activityIds.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "activityIds is required" },
        { status: 400 }
      );
    }

    const activities = await db
      .select({ id: workspaceActivities.id, examId: workspaceActivities.examId })
      .from(workspaceActivities)
      .where(
        and(eq(workspaceActivities.workspaceId, id), inArray(workspaceActivities.id, activityIds))
      );

    const members = await db
      .select({ studentId: workspaceMemberships.studentId })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.workspaceId, id));
    const memberIds = members.map((m) => m.studentId);

    const examIds = activities.filter((a) => a.examId).map((a) => a.examId!) as string[];
    let examsWithSubmissions = new Set<string>();
    if (examIds.length > 0 && memberIds.length > 0) {
      const rows = await db
        .selectDistinct({ examId: examSubmissions.examId })
        .from(examSubmissions)
        .where(
          and(
            inArray(examSubmissions.examId, examIds),
            inArray(examSubmissions.studentId, memberIds)
          )
        );
      examsWithSubmissions = new Set(rows.map((r) => r.examId));
    }

    const blocked = activities
      .filter((a) => a.examId && examsWithSubmissions.has(a.examId))
      .map((a) => ({ activityId: a.id, reason: "ACTIVITY_HAS_SUBMISSIONS" }));
    const blockedIds = new Set(blocked.map((b) => b.activityId));
    const removableIds = activities.filter((a) => !blockedIds.has(a.id)).map((a) => a.id);

    if (removableIds.length > 0) {
      await db
        .delete(workspaceActivities)
        .where(inArray(workspaceActivities.id, removableIds));
    }

    return NextResponse.json({ status: "SUCCESS", removed: removableIds, blocked });
  } catch (error) {
    console.error("Bulk remove activities error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove activities" },
      { status: 500 }
    );
  }
}
