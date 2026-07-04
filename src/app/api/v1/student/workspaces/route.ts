import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMemberships } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

export async function GET(request: NextRequest) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        description: workspaces.description,
        status: workspaces.status,
        totalDays: workspaces.totalDays,
        startDate: workspaces.startDate,
        endDate: workspaces.endDate,
        joinedAt: workspaceMemberships.joinedAt,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.studentId, studentId),
          eq(workspaceMemberships.status, "ACTIVE")
        )
      )
      .orderBy(desc(workspaces.createdAt));

    return NextResponse.json({ status: "SUCCESS", workspaces: rows });
  } catch (error) {
    console.error("Student list workspaces error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}
