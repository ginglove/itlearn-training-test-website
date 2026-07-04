import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships, teachingDays } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

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
      .where(eq(workspaces.createdBy, teacherId))
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

export async function POST(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, totalDays, startDate, endDate } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Workspace name is required" },
        { status: 400 }
      );
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: name.trim(),
        description: description || null,
        totalDays: totalDays !== undefined ? parseInt(totalDays) || 0 : 0,
        startDate: startDate || null,
        endDate: endDate || null,
        createdBy: teacherId,
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", workspace }, { status: 201 });
  } catch (error) {
    console.error("Create workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
