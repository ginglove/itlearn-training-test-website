import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, exams } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

const TYPE_FROM_SESSION: Record<string, "QUIZ" | "ASSESSMENT" | "EXERCISE" | "HOMEWORK"> = {
  QUIZ: "QUIZ",
  FINAL: "ASSESSMENT",
  PRACTICE: "EXERCISE",
  HOMEWORK: "HOMEWORK",
};

// POST — re-derive every exam-backed activity's type from its exam's session
// type (fixes activities assigned before the mapping existed).
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

    const rows = await db
      .select({
        activityId: workspaceActivities.id,
        currentType: workspaceActivities.activityType,
        sessionType: exams.sessionType,
      })
      .from(workspaceActivities)
      .innerJoin(exams, eq(exams.id, workspaceActivities.examId))
      .where(and(eq(workspaceActivities.workspaceId, id), isNotNull(workspaceActivities.examId)));

    let updated = 0;
    for (const row of rows) {
      const target = TYPE_FROM_SESSION[row.sessionType] ?? "QUIZ";
      if (target !== row.currentType) {
        await db
          .update(workspaceActivities)
          .set({ activityType: target })
          .where(eq(workspaceActivities.id, row.activityId));
        updated++;
      }
    }

    return NextResponse.json({ status: "SUCCESS", updated });
  } catch (error) {
    console.error("Resync activity types error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to resync activity types" },
      { status: 500 }
    );
  }
}
