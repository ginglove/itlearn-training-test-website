import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, attendanceRecords } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

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
        notes: teachingDays.notes,
        hasRollCall: sql<boolean>`EXISTS (SELECT 1 FROM ${attendanceRecords} WHERE ${attendanceRecords.teachingDayId} = ${teachingDays.id})`,
      })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id))
      .orderBy(teachingDays.dayNumber);

    return NextResponse.json({ status: "SUCCESS", teachingDays: days });
  } catch (error) {
    console.error("Get timetable error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch timetable" },
      { status: 500 }
    );
  }
}

export async function POST(
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
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { scheduledDate, topic, notes } = body;
    if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "scheduledDate (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }

    const [duplicate] = await db
      .select({ id: teachingDays.id })
      .from(teachingDays)
      .where(and(eq(teachingDays.workspaceId, id), eq(teachingDays.scheduledDate, scheduledDate)))
      .limit(1);
    if (duplicate) {
      return NextResponse.json(
        {
          error: "DUPLICATE_TEACHING_DAY_DATE",
          message: "A teaching day already exists on this date",
        },
        { status: 409 }
      );
    }

    // day_number is sequential without gaps: next = max + 1
    const [{ maxDay }] = await db
      .select({ maxDay: sql<number>`COALESCE(MAX(${teachingDays.dayNumber}), 0)` })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id));

    const [day] = await db
      .insert(teachingDays)
      .values({
        workspaceId: id,
        dayNumber: Number(maxDay) + 1,
        scheduledDate,
        topic: topic || null,
        notes: notes || null,
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", teachingDay: day }, { status: 201 });
  } catch (error) {
    console.error("Add teaching day error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to add teaching day" },
      { status: 500 }
    );
  }
}
