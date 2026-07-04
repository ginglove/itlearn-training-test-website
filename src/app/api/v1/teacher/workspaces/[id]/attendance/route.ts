import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, attendanceRecords, workspaceMemberships, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// Full attendance matrix: all students x all teaching days
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

    const workspace = await getOwnedWorkspace(teacherId, id);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }

    const days = await db
      .select({
        id: teachingDays.id,
        dayNumber: teachingDays.dayNumber,
        scheduledDate: teachingDays.scheduledDate,
        topic: teachingDays.topic,
      })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id))
      .orderBy(teachingDays.dayNumber);

    const members = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        username: users.username,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.studentId))
      .where(
        and(eq(workspaceMemberships.workspaceId, id), eq(workspaceMemberships.status, "ACTIVE"))
      )
      .orderBy(users.fullName);

    const dayIds = days.map((d) => d.id);
    const records = dayIds.length
      ? await db
          .select({
            teachingDayId: attendanceRecords.teachingDayId,
            studentId: attendanceRecords.studentId,
            status: attendanceRecords.status,
          })
          .from(attendanceRecords)
          .where(inArray(attendanceRecords.teachingDayId, dayIds))
      : [];

    const matrix: Record<string, Record<string, string>> = {};
    for (const r of records) {
      (matrix[r.studentId] ??= {})[r.teachingDayId] = r.status;
    }

    return NextResponse.json({ status: "SUCCESS", days, members, matrix });
  } catch (error) {
    console.error("Get attendance matrix error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}
