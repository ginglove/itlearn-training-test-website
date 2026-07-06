import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, workspaceActivityAttempts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getMemberWorkspace } from "@/lib/workspace";

// POST — submit a text response for a standalone (non exam-backed) activity
// (RSD_improvement_technical §2: workspace_activity_attempts)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, activityId } = await params;

    const workspace = await getMemberWorkspace(studentId, id);
    if (!workspace) {
      return NextResponse.json(
        { error: "STUDENT_NOT_MEMBER", message: "You are not a member of this workspace" },
        { status: 403 }
      );
    }
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "This class has ended" },
        { status: 409 }
      );
    }

    const [activity] = await db
      .select()
      .from(workspaceActivities)
      .where(
        and(eq(workspaceActivities.id, activityId), eq(workspaceActivities.workspaceId, id))
      )
      .limit(1);
    if (!activity) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Activity not found" }, { status: 404 });
    }
    if (activity.examId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "This activity is exam-backed; use the exam flow" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const textResponse = typeof body.textResponse === "string" ? body.textResponse.trim() : "";
    if (!textResponse) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "textResponse is required" },
        { status: 400 }
      );
    }

    // One attempt per student per activity; resubmission overwrites (score resets)
    const [attempt] = await db
      .insert(workspaceActivityAttempts)
      .values({ activityId, studentId, textResponse })
      .onConflictDoUpdate({
        target: [workspaceActivityAttempts.activityId, workspaceActivityAttempts.studentId],
        set: { textResponse, submittedAt: new Date(), scorePercentage: null },
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", attempt }, { status: 201 });
  } catch (error) {
    console.error("Submit activity attempt error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to submit response" },
      { status: 500 }
    );
  }
}
