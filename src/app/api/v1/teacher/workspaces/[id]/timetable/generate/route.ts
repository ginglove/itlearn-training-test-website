import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace, generateTimetableDays } from "@/lib/workspace";

// POST — auto-generate the remaining teaching days from the workspace schedule
// (start_date + schedule_days weekdays, up to total_days). RSD §12.2.
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
    if (!workspace.startDate || !workspace.totalDays || !workspace.scheduleDays?.length) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message:
            "The workspace needs a start date, total days, and weekly schedule days before the timetable can be generated.",
        },
        { status: 400 }
      );
    }

    const created = await generateTimetableDays(id);
    return NextResponse.json({ status: "SUCCESS", created });
  } catch (error) {
    console.error("Generate timetable error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to generate timetable" },
      { status: 500 }
    );
  }
}
