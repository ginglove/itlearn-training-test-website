import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays, workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// GET — export the timetable (day, date, topic, notes) as .xlsx.
// Re-import the same file after editing the Topic/Notes columns.
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

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }

    const days = await db
      .select()
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id))
      .orderBy(teachingDays.scheduledDate);

    const rows = days.map((d) => ({
      Day: d.teacherAbsent ? "-" : d.dayNumber,
      Date: d.scheduledDate,
      Topic: d.topic ?? "",
      Notes: d.notes ?? "",
      "Teacher Absent": d.teacherAbsent ? "YES" : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Timetable");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const safeName = workspace.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="timetable_${safeName}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export timetable error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to export timetable" },
      { status: 500 }
    );
  }
}
