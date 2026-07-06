import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceTeachers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// POST /api/v1/admin/workspaces/:id/teachers/:teacherId — assign teacher (RSD v9 §9.2)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teacherId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { id, teacherId } = await params;

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }

    const [teacher] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, teacherId), eq(users.role, "TEACHER")))
      .limit(1);
    if (!teacher) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Teacher not found" },
        { status: 404 }
      );
    }

    await db
      .insert(workspaceTeachers)
      .values({ workspaceId: id, teacherId })
      .onConflictDoNothing();

    return NextResponse.json({ status: "SUCCESS" }, { status: 201 });
  } catch (error) {
    console.error("Admin assign teacher error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to assign teacher" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/admin/workspaces/:id/teachers/:teacherId — remove assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teacherId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { id, teacherId } = await params;

    await db
      .delete(workspaceTeachers)
      .where(
        and(eq(workspaceTeachers.workspaceId, id), eq(workspaceTeachers.teacherId, teacherId))
      );

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Admin remove teacher error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove teacher assignment" },
      { status: 500 }
    );
  }
}
