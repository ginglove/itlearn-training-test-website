import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceMemberships, workspaceActivities, examSubmissions } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// POST — remove multiple students from the workspace in one action.
// Students with submissions in this workspace are skipped (W2) and reported.
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
    const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];
    if (studentIds.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "studentIds is required" },
        { status: 400 }
      );
    }

    // Students with submissions for this workspace's exam-backed activities are blocked (W2)
    const activities = await db
      .select({ examId: workspaceActivities.examId })
      .from(workspaceActivities)
      .where(and(eq(workspaceActivities.workspaceId, id), isNotNull(workspaceActivities.examId)));
    const examIds = activities.map((a) => a.examId!).filter(Boolean);

    let blockedIds = new Set<string>();
    if (examIds.length > 0) {
      const withSubmissions = await db
        .selectDistinct({ studentId: examSubmissions.studentId })
        .from(examSubmissions)
        .where(
          and(
            inArray(examSubmissions.examId, examIds),
            inArray(examSubmissions.studentId, studentIds)
          )
        );
      blockedIds = new Set(withSubmissions.map((s) => s.studentId));
    }

    const removableIds = studentIds.filter((sid) => !blockedIds.has(sid));
    if (removableIds.length > 0) {
      await db
        .update(workspaceMemberships)
        .set({ status: "REMOVED" })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, id),
            inArray(workspaceMemberships.studentId, removableIds)
          )
        );
    }

    return NextResponse.json({
      status: "SUCCESS",
      removed: removableIds,
      blocked: [...blockedIds].map((studentId) => ({
        studentId,
        reason: "MEMBER_HAS_SUBMISSIONS",
      })),
    });
  } catch (error) {
    console.error("Bulk remove members error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove students" },
      { status: 500 }
    );
  }
}
