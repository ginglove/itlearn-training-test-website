import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace, appendMakeupDay, renumberTeachingDays } from "@/lib/workspace";

// POST — mark a teaching day as teacher-absent and auto-append a makeup day
// after the current last day so the class still reaches its planned length.
export async function POST(
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

    const [day] = await db
      .select()
      .from(teachingDays)
      .where(and(eq(teachingDays.id, dayId), eq(teachingDays.workspaceId, id)))
      .limit(1);
    if (!day) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teaching day not found" }, { status: 404 });
    }
    if (day.teacherAbsent) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Day is already marked as teacher absent" },
        { status: 409 }
      );
    }

    await db.update(teachingDays).set({ teacherAbsent: true }).where(eq(teachingDays.id, dayId));
    const makeupDate = await appendMakeupDay(id);
    // Subsequent days shift up so numbering counts taught days only
    // (absent day 7 → the next class becomes day 7, and so on)
    await renumberTeachingDays(id);

    return NextResponse.json({ status: "SUCCESS", makeupDate });
  } catch (error) {
    console.error("Mark teacher absence error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to mark absence" },
      { status: 500 }
    );
  }
}
