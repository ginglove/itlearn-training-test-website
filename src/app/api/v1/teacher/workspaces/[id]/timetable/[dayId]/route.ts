import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, attendanceRecords } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

async function getDay(workspaceId: string, dayId: string) {
  const [day] = await db
    .select()
    .from(teachingDays)
    .where(and(eq(teachingDays.id, dayId), eq(teachingDays.workspaceId, workspaceId)))
    .limit(1);
  return day ?? null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, dayId } = await params;

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

    const day = await getDay(id, dayId);
    if (!day) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teaching day not found" }, { status: 404 });
    }

    const body = await request.json();
    const { scheduledDate, topic, notes } = body;

    if (scheduledDate !== undefined && scheduledDate !== day.scheduledDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "scheduledDate must be YYYY-MM-DD" },
          { status: 400 }
        );
      }
      const [duplicate] = await db
        .select({ id: teachingDays.id })
        .from(teachingDays)
        .where(
          and(eq(teachingDays.workspaceId, id), eq(teachingDays.scheduledDate, scheduledDate))
        )
        .limit(1);
      if (duplicate && duplicate.id !== dayId) {
        return NextResponse.json(
          {
            error: "DUPLICATE_TEACHING_DAY_DATE",
            message: "A teaching day already exists on this date",
          },
          { status: 409 }
        );
      }
    }

    // Warn (but allow) date changes when roll call already recorded — spec 5.2.3
    const [attendance] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.teachingDayId, dayId))
      .limit(1);
    const warning =
      attendance && scheduledDate !== undefined && scheduledDate !== day.scheduledDate
        ? "Roll call records exist for this day. Changing the date does not alter existing attendance records."
        : null;

    const [updated] = await db
      .update(teachingDays)
      .set({
        ...(scheduledDate !== undefined ? { scheduledDate } : {}),
        ...(topic !== undefined ? { topic: topic || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      })
      .where(eq(teachingDays.id, dayId))
      .returning();

    return NextResponse.json({ status: "SUCCESS", teachingDay: updated, warning });
  } catch (error) {
    console.error("Update teaching day error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update teaching day" },
      { status: 500 }
    );
  }
}

// W3: deleting a day re-sequences subsequent day numbers atomically
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, dayId } = await params;

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

    const day = await getDay(id, dayId);
    if (!day) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teaching day not found" }, { status: 404 });
    }

    const [attendance] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.teachingDayId, dayId))
      .limit(1);
    if (attendance) {
      return NextResponse.json(
        {
          error: "TEACHING_DAY_HAS_ATTENDANCE",
          message: "Void all attendance records for this day before deleting it",
        },
        { status: 409 }
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(teachingDays).where(eq(teachingDays.id, dayId));
      // Two-phase shift to avoid transient unique(day_number) collisions
      await tx
        .update(teachingDays)
        .set({ dayNumber: sql`-${teachingDays.dayNumber}` })
        .where(and(eq(teachingDays.workspaceId, id), gt(teachingDays.dayNumber, day.dayNumber)));
      await tx
        .update(teachingDays)
        .set({ dayNumber: sql`-${teachingDays.dayNumber} - 1` })
        .where(and(eq(teachingDays.workspaceId, id), sql`${teachingDays.dayNumber} < 0`));
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Delete teaching day error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete teaching day" },
      { status: 500 }
    );
  }
}
