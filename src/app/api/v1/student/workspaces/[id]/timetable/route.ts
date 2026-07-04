import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays } from "@/db/schema";
import { eq } from "drizzle-orm";
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

    const days = await db
      .select({
        id: teachingDays.id,
        dayNumber: teachingDays.dayNumber,
        scheduledDate: teachingDays.scheduledDate,
        topic: teachingDays.topic,
        notes: teachingDays.notes,
      })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id))
      .orderBy(teachingDays.dayNumber);

    return NextResponse.json({ status: "SUCCESS", teachingDays: days });
  } catch (error) {
    console.error("Student timetable error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch timetable" },
      { status: 500 }
    );
  }
}
