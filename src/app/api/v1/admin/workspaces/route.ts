import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, workspaceTeachers, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/workspaces — global workspace list with teacher assignments
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const rows = await db
      .select({
        workspace: workspaces,
        memberCount: sql<number>`(
          SELECT COUNT(*) FROM ${workspaceMemberships}
          WHERE ${workspaceMemberships.workspaceId} = ${workspaces.id}
            AND ${workspaceMemberships.status} = 'ACTIVE'
        )`,
      })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt));

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
        memberCount: Number(r.memberCount),
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
    const { name, description, totalDays, startDate, endDate } = body;
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
        createdBy: adminId,
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", workspace }, { status: 201 });
  } catch (error) {
    console.error("Admin create workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
