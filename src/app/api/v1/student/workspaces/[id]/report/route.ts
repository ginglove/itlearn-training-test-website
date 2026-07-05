import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceClassReports } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getMemberWorkspace } from "@/lib/workspace";
import { buildWorkspaceReport, type WorkspaceReportData } from "@/lib/workspace-report";

// W9: student sees only their own section of the latest report, post-archive only
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
    // Prefer the canonical archived snapshot; otherwise build the student's
    // results live so they always see their current standing automatically.
    const [report] =
      workspace.status === "ARCHIVED"
        ? await db
            .select()
            .from(workspaceClassReports)
            .where(eq(workspaceClassReports.workspaceId, id))
            .orderBy(desc(workspaceClassReports.generatedAt))
            .limit(1)
        : [undefined];

    const live = !report;
    const data = report
      ? (report.reportData as WorkspaceReportData)
      : await buildWorkspaceReport(id);
    const mySection = data.students.find((s) => s.studentId === studentId);
    if (!mySection) {
      return NextResponse.json(
        { error: "REPORT_NOT_GENERATED", message: "No report section for this student" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "SUCCESS",
      live,
      generatedAt: report ? report.generatedAt : data.generatedAt,
      workspaceName: data.workspaceName,
      totalScheduledDays: data.totalScheduledDays,
      totalConductedDays: data.totalConductedDays,
      attendance: mySection.attendance,
      activities: mySection.activities,
      summary: mySection.summary,
    });
  } catch (error) {
    console.error("Student report error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch report" },
      { status: 500 }
    );
  }
}
