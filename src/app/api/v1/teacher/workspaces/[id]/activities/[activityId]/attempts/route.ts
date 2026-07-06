import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, workspaceActivityAttempts, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

async function getActivity(workspaceId: string, activityId: string) {
  const [activity] = await db
    .select()
    .from(workspaceActivities)
    .where(
      and(eq(workspaceActivities.id, activityId), eq(workspaceActivities.workspaceId, workspaceId))
    )
    .limit(1);
  return activity ?? null;
}

// GET — list standalone-activity attempts for grading
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, activityId } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    const activity = await getActivity(id, activityId);
    if (!activity) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Activity not found" }, { status: 404 });
    }

    const attempts = await db
      .select({
        id: workspaceActivityAttempts.id,
        studentId: users.id,
        fullName: users.fullName,
        username: users.username,
        textResponse: workspaceActivityAttempts.textResponse,
        submittedAt: workspaceActivityAttempts.submittedAt,
        scorePercentage: workspaceActivityAttempts.scorePercentage,
      })
      .from(workspaceActivityAttempts)
      .innerJoin(users, eq(users.id, workspaceActivityAttempts.studentId))
      .where(eq(workspaceActivityAttempts.activityId, activityId))
      .orderBy(users.fullName);

    return NextResponse.json({ status: "SUCCESS", attempts });
  } catch (error) {
    console.error("List activity attempts error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch attempts" },
      { status: 500 }
    );
  }
}

// PUT — grade a standalone attempt { studentId, scorePercentage }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, activityId } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    const activity = await getActivity(id, activityId);
    if (!activity) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Activity not found" }, { status: 404 });
    }

    const body = await request.json();
    const { studentId, scorePercentage } = body;
    const score = Number(scorePercentage);
    if (!studentId || !Number.isFinite(score) || score < 0 || score > 100) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "studentId and scorePercentage (0-100) are required" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(workspaceActivityAttempts)
      .set({ scorePercentage: score.toFixed(2) })
      .where(
        and(
          eq(workspaceActivityAttempts.activityId, activityId),
          eq(workspaceActivityAttempts.studentId, studentId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "SUBMISSION_NOT_FOUND", message: "No attempt found for this student" },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: "SUCCESS", attempt: updated });
  } catch (error) {
    console.error("Grade activity attempt error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to grade attempt" },
      { status: 500 }
    );
  }
}
