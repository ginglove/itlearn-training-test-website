import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceMemberships, workspaceActivities, examSubmissions } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// W2: a student with submissions in this workspace cannot be removed
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, studentId } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const activities = await db
      .select({ examId: workspaceActivities.examId })
      .from(workspaceActivities)
      .where(and(eq(workspaceActivities.workspaceId, id), isNotNull(workspaceActivities.examId)));
    const examIds = activities.map((a) => a.examId!).filter(Boolean);

    if (examIds.length > 0) {
      const [submission] = await db
        .select({ id: examSubmissions.id })
        .from(examSubmissions)
        .where(
          and(
            inArray(examSubmissions.examId, examIds),
            eq(examSubmissions.studentId, studentId)
          )
        )
        .limit(1);
      if (submission) {
        return NextResponse.json(
          {
            error: "MEMBER_HAS_SUBMISSIONS",
            message: "Student has submission records in this workspace",
          },
          { status: 409 }
        );
      }
    }

    await db
      .update(workspaceMemberships)
      .set({ status: "REMOVED" })
      .where(
        and(
          eq(workspaceMemberships.workspaceId, id),
          eq(workspaceMemberships.studentId, studentId)
        )
      );

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove member" },
      { status: 500 }
    );
  }
}
