import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, teachingDays } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { teacherAssignedCondition } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await db
      .select({
        workspace: workspaces,
        memberCount: sql<number>`(SELECT COUNT(*) FROM ${workspaceMemberships} WHERE ${workspaceMemberships.workspaceId} = ${workspaces.id} AND ${workspaceMemberships.status} = 'ACTIVE')`,
        dayCount: sql<number>`(SELECT COUNT(*) FROM ${teachingDays} WHERE ${teachingDays.workspaceId} = ${workspaces.id})`,
      })
      .from(workspaces)
      .where(isAdminRequest(request) ? sql`TRUE` : teacherAssignedCondition(teacherId))
      .orderBy(desc(workspaces.createdAt));

    return NextResponse.json({
      status: "SUCCESS",
      workspaces: rows.map((r) => ({
        ...r.workspace,
        memberCount: Number(r.memberCount),
        dayCount: Number(r.dayCount),
      })),
    });
  } catch (error) {
    console.error("Fetch workspaces error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

// Workspace creation is admin-only (§2.3 access matrix); teachers work with
// workspaces assigned to them via workspace_teachers.
