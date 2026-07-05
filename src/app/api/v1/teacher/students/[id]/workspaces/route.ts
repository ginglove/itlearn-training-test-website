import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceMemberships, workspaces, workspaceTeachers } from "@/db/schema";
import { and, eq, exists, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";

// GET — workspaces (visible to the caller) the student is an ACTIVE member of
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id: studentId } = await params;

    const visible = isAdminRequest(request)
      ? sql`TRUE`
      : exists(
          db
            .select({ one: sql`1` })
            .from(workspaceTeachers)
            .where(
              and(
                eq(workspaceTeachers.workspaceId, workspaces.id),
                eq(workspaceTeachers.teacherId, teacherId)
              )
            )
        );

    const rows = await db
      .select({ workspaceId: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.studentId, studentId),
          eq(workspaceMemberships.status, "ACTIVE"),
          visible
        )
      );

    return NextResponse.json({
      status: "SUCCESS",
      workspaceIds: rows.map((r) => r.workspaceId),
    });
  } catch (error) {
    console.error("Student workspaces error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch student workspaces" },
      { status: 500 }
    );
  }
}
