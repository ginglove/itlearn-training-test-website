import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, attendanceRecords, workspaceMemberships, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

const VALID_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
type AttendanceStatus = (typeof VALID_STATUSES)[number];

async function getDay(workspaceId: string, dayId: string) {
  const [day] = await db
    .select()
    .from(teachingDays)
    .where(and(eq(teachingDays.id, dayId), eq(teachingDays.workspaceId, workspaceId)))
    .limit(1);
  return day ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, dayId } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    const day = await getDay(id, dayId);
    if (!day) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teaching day not found" }, { status: 404 });
    }

    // W5: only ACTIVE members are included
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

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.teachingDayId, dayId));
    const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

    return NextResponse.json({
      status: "SUCCESS",
      teachingDay: day,
      rollCall: members.map((m) => ({
        ...m,
        status: recordByStudent.get(m.studentId)?.status ?? null,
        note: recordByStudent.get(m.studentId)?.note ?? null,
      })),
    });
  } catch (error) {
    console.error("Get roll call error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch roll call" },
      { status: 500 }
    );
  }
}

// W4: atomic overwrite of the day's roll call
async function saveRollCall(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id, dayId } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
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
    const records: { studentId: string; status: AttendanceStatus; note?: string }[] =
      Array.isArray(body.records) ? body.records : [];
    if (records.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "records is required" },
        { status: 400 }
      );
    }
    for (const r of records) {
      if (!r.studentId || !VALID_STATUSES.includes(r.status)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Each record needs studentId and a valid status" },
          { status: 400 }
        );
      }
    }

    // Only ACTIVE members may be marked
    const members = await db
      .select({ studentId: workspaceMemberships.studentId })
      .from(workspaceMemberships)
      .where(
        and(eq(workspaceMemberships.workspaceId, id), eq(workspaceMemberships.status, "ACTIVE"))
      );
    const memberIds = new Set(members.map((m) => m.studentId));
    const nonMembers = records.filter((r) => !memberIds.has(r.studentId));
    if (nonMembers.length > 0) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: `Not active members: ${nonMembers.map((r) => r.studentId).join(", ")}`,
        },
        { status: 400 }
      );
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(attendanceRecords).where(eq(attendanceRecords.teachingDayId, dayId));
        await tx.insert(attendanceRecords).values(
          records.map((r) => ({
            teachingDayId: dayId,
            studentId: r.studentId,
            status: r.status,
            note: r.note || null,
          }))
        );
      });
    } catch (txError) {
      console.error("Roll call transaction error:", txError);
      return NextResponse.json(
        { error: "ROLLCALL_SAVE_FAILED", message: "Roll call save failed; all records rolled back" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Save roll call error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to save roll call" },
      { status: 500 }
    );
  }
}

export { saveRollCall as POST, saveRollCall as PUT };

// 5.2.4: void all attendance records for a day (prerequisite for deleting the day)
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

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
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

    await db.delete(attendanceRecords).where(eq(attendanceRecords.teachingDayId, dayId));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Void roll call error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to void roll call" },
      { status: 500 }
    );
  }
}
