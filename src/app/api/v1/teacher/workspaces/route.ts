import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, teachingDays } from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { teacherAssignedCondition } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaces)
      .where(isAdminRequest(request) ? sql`TRUE` : teacherAssignedCondition(teacherId))
      .orderBy(desc(workspaces.createdAt));

    const memberCounts = await db
      .select({ workspaceId: workspaceMemberships.workspaceId, total: count() })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.status, "ACTIVE"))
      .groupBy(workspaceMemberships.workspaceId);
    const membersByWorkspace = new Map(memberCounts.map((r) => [r.workspaceId, Number(r.total)]));

    const dayCounts = await db
      .select({ workspaceId: teachingDays.workspaceId, total: count() })
      .from(teachingDays)
      .groupBy(teachingDays.workspaceId);
    const daysByWorkspace = new Map(dayCounts.map((r) => [r.workspaceId, Number(r.total)]));

    return NextResponse.json({
      status: "SUCCESS",
      workspaces: rows.map((r) => ({
        ...r.workspace,
        memberCount: membersByWorkspace.get(r.workspace.id) ?? 0,
        dayCount: daysByWorkspace.get(r.workspace.id) ?? 0,
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
