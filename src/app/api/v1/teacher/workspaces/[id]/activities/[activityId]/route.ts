import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, workspaceMemberships, examSubmissions, teachingDays } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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

async function hasWorkspaceSubmissions(workspaceId: string, examId: string) {
  const members = await db
    .select({ studentId: workspaceMemberships.studentId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));
  const memberIds = members.map((m) => m.studentId);
  if (memberIds.length === 0) return false;

  const [submission] = await db
    .select({ id: examSubmissions.id })
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId), inArray(examSubmissions.studentId, memberIds)))
    .limit(1);
  return !!submission;
}

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
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const activity = await getActivity(id, activityId);
    if (!activity) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Activity not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, dueDate, teachingDayId } = body;

    if (teachingDayId) {
      const [day] = await db
        .select({ id: teachingDays.id })
        .from(teachingDays)
        .where(and(eq(teachingDays.id, teachingDayId), eq(teachingDays.workspaceId, id)))
        .limit(1);
      if (!day) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Teaching day not found in this workspace" },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(workspaceActivities)
      .set({
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(teachingDayId !== undefined ? { teachingDayId: teachingDayId || null } : {}),
      })
      .where(eq(workspaceActivities.id, activityId))
      .returning();

    return NextResponse.json({ status: "SUCCESS", activity: updated });
  } catch (error) {
    console.error("Update activity error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update activity" },
      { status: 500 }
    );
  }
}

// 7.2.6: removal blocked when submissions exist in this workspace context
export async function DELETE(
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
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const activity = await getActivity(id, activityId);
    if (!activity) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Activity not found" }, { status: 404 });
    }

    if (activity.examId && (await hasWorkspaceSubmissions(id, activity.examId))) {
      return NextResponse.json(
        {
          error: "ACTIVITY_HAS_SUBMISSIONS",
          message: "Students have already submitted for this activity",
        },
        { status: 409 }
      );
    }

    await db.delete(workspaceActivities).where(eq(workspaceActivities.id, activityId));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Delete activity error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove activity" },
      { status: 500 }
    );
  }
}
