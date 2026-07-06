import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, attendanceRecords } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getMemberWorkspace } from "@/lib/workspace";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const workspace = await getMemberWorkspace(studentId, id);
    if (!workspace) {
      return NextResponse.json(
        { error: "STUDENT_NOT_MEMBER", message: "You are not a member of this workspace" },
        { status: 403 }
      );
    }

    const rows = await db
      .select({
        teachingDayId: teachingDays.id,
        dayNumber: teachingDays.dayNumber,
        scheduledDate: teachingDays.scheduledDate,
        topic: teachingDays.topic,
        status: attendanceRecords.status,
        note: attendanceRecords.note,
      })
      .from(teachingDays)
      .leftJoin(
        attendanceRecords,
        and(
          eq(attendanceRecords.teachingDayId, teachingDays.id),
          eq(attendanceRecords.studentId, studentId)
        )
      )
      .where(eq(teachingDays.workspaceId, id))
      .orderBy(teachingDays.dayNumber);

    return NextResponse.json({ status: "SUCCESS", attendance: rows });
  } catch (error) {
    console.error("Student attendance error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}
