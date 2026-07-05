import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  workspaces,
  workspaceMemberships,
  teachingDays,
  workspaceActivities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

export async function GET(
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

    return NextResponse.json({ status: "SUCCESS", workspace });
  } catch (error) {
    console.error("Get workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch workspace" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { name, description, totalDays, startDate, endDate } = body;

    const [updated] = await db
      .update(workspaces)
      .set({
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(totalDays !== undefined ? { totalDays: parseInt(totalDays) || 0 } : {}),
        ...(startDate !== undefined ? { startDate: startDate || null } : {}),
        ...(endDate !== undefined ? { endDate: endDate || null } : {}),
      })
      .where(eq(workspaces.id, id))
      .returning();

    return NextResponse.json({ status: "SUCCESS", workspace: updated });
  } catch (error) {
    console.error("Update workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update workspace" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // A workspace with memberships, teaching days, or activities must be archived instead
    const [membership] = await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.workspaceId, id))
      .limit(1);
    const [day] = await db
      .select({ id: teachingDays.id })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id))
      .limit(1);
    const [activity] = await db
      .select({ id: workspaceActivities.id })
      .from(workspaceActivities)
      .where(eq(workspaceActivities.workspaceId, id))
      .limit(1);

    if (membership || day || activity) {
      return NextResponse.json(
        {
          error: "WORKSPACE_ARCHIVE_BLOCKED",
          message: "Workspace has related records. Archive it instead of deleting.",
        },
        { status: 409 }
      );
    }

    await db.delete(workspaces).where(eq(workspaces.id, id));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
