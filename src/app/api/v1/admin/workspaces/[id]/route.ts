import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, teachingDays, workspaceActivities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// DELETE /api/v1/admin/workspaces/:id — delete an empty workspace (matrix: admin ✅)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }

    // §5.1.2 deletion protection: related records force archive instead
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
    console.error("Admin delete workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
