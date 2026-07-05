import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceClassReports } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";
import type { WorkspaceReportData } from "@/lib/workspace-report";

// 8.3.5: export latest report as .xlsx — one row per student
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

    const [report] = await db
      .select()
      .from(workspaceClassReports)
      .where(eq(workspaceClassReports.workspaceId, id))
      .orderBy(desc(workspaceClassReports.generatedAt))
      .limit(1);
    if (!report) {
      return NextResponse.json(
        { error: "REPORT_NOT_GENERATED", message: "No report generated yet" },
        { status: 404 }
      );
    }

    const data = report.reportData as WorkspaceReportData;
    const rows = data.students.map((s) => ({
      "Student Code": s.studentCode,
      "Full Name": s.fullName,
      "Present Days": s.attendance.presentDays,
      "Late Days": s.attendance.lateDays,
      "Absent Days": s.attendance.absentDays,
      "Excused Days": s.attendance.excusedDays,
      "Attendance Rate (%)": s.attendance.attendanceRate,
      "Total Activities": s.summary.totalActivities,
      "Submitted": s.summary.submittedCount,
      "Average Score": s.summary.averageScore ?? "—",
      "Highest Score": s.summary.highestScore ?? "—",
      "Lowest Score": s.summary.lowestScore ?? "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Class Report");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const safeName = data.workspaceName.replace(/[^a-zA-Z0-9-_]+/g, "_");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report_${safeName}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export report error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to export report" },
      { status: 500 }
    );
  }
}
