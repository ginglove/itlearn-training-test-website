import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, workspaceTeachers, workspaceActivities, users } from "@/db/schema";
import { count, desc, eq, isNotNull } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";
import { generateTimetableDays } from "@/lib/workspace";

// GET /api/v1/admin/workspaces — global workspace list with teacher assignments
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt));

    // Active member count per workspace
    const memberCounts = await db
      .select({ workspaceId: workspaceMemberships.workspaceId, total: count() })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.status, "ACTIVE"))
      .groupBy(workspaceMemberships.workspaceId);
    const membersByWorkspace = new Map(memberCounts.map((r) => [r.workspaceId, Number(r.total)]));

    // Exam-backed activity count per workspace
    const examCounts = await db
      .select({ workspaceId: workspaceActivities.workspaceId, total: count() })
      .from(workspaceActivities)
      .where(isNotNull(workspaceActivities.examId))
      .groupBy(workspaceActivities.workspaceId);
    const examsByWorkspace = new Map(examCounts.map((r) => [r.workspaceId, Number(r.total)]));

    const assignments = await db
      .select({
        workspaceId: workspaceTeachers.workspaceId,
        teacherId: users.id,
        fullName: users.fullName,
      })
      .from(workspaceTeachers)
      .innerJoin(users, eq(users.id, workspaceTeachers.teacherId));

    const byWorkspace = new Map<string, { teacherId: string; fullName: string }[]>();
    for (const a of assignments) {
      const list = byWorkspace.get(a.workspaceId) ?? [];
      list.push({ teacherId: a.teacherId, fullName: a.fullName });
      byWorkspace.set(a.workspaceId, list);
    }

    return NextResponse.json({
      status: "SUCCESS",
      workspaces: rows.map((r) => ({
        ...r.workspace,
        memberCount: membersByWorkspace.get(r.workspace.id) ?? 0,
        examCount: examsByWorkspace.get(r.workspace.id) ?? 0,
        teachers: byWorkspace.get(r.workspace.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("Admin list workspaces error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

// POST /api/v1/admin/workspaces — create a workspace (matrix: admin ✅)
export async function POST(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, totalDays, startDate, endDate, scheduleDays } = body;
    const validScheduleDays = Array.isArray(scheduleDays)
      ? [...new Set(scheduleDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      : null;
    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Workspace name is required" },
        { status: 400 }
      );
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: String(name).trim(),
        description: description || null,
        totalDays: totalDays !== undefined ? parseInt(totalDays) || 0 : 0,
        startDate: startDate || null,
        endDate: endDate || null,
        scheduleDays: validScheduleDays?.length ? validScheduleDays : null,
        createdBy: adminId,
      })
      .returning();

    // Auto-generate the timetable when a weekly schedule was provided
    let generatedDays = 0;
    if (workspace.startDate && workspace.totalDays > 0 && validScheduleDays?.length) {
      generatedDays = await generateTimetableDays(workspace.id);
    }

    return NextResponse.json({ status: "SUCCESS", workspace, generatedDays }, { status: 201 });
  } catch (error) {
    console.error("Admin create workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
