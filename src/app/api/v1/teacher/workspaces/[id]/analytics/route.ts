import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";
import { buildWorkspaceReport } from "@/lib/workspace-report";

const PASS_MARK = 50; // percent, consistent with the sessions dashboard
const TYPES = ["QUIZ", "ASSESSMENT", "HOMEWORK", "EXERCISE"] as const;

// GET — live visual-report analytics for a workspace (works on ACTIVE
// workspaces, unlike the end-of-class report snapshot): per student, days
// studied plus attempts/pass/fail/average split by activity type.
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

    const report = await buildWorkspaceReport(id);

    const students = report.students.map((s) => {
      const byType: Record<
        string,
        { assigned: number; attempts: number; passed: number; failed: number; averageScore: number | null }
      > = {};
      for (const type of TYPES) {
        const acts = s.activities.filter((a) => a.type === type);
        const submitted = acts.filter((a) => a.submissionStatus === "SUBMITTED");
        const scored = submitted.filter((a) => a.scorePercentage !== null);
        const passed = scored.filter((a) => (a.scorePercentage as number) >= PASS_MARK).length;
        byType[type] = {
          assigned: acts.length,
          attempts: submitted.length,
          passed,
          failed: scored.length - passed,
          averageScore: scored.length
            ? Math.round(
                (scored.reduce((sum, a) => sum + (a.scorePercentage as number), 0) / scored.length) * 10
              ) / 10
            : null,
        };
      }
      return {
        studentId: s.studentId,
        fullName: s.fullName,
        studentCode: s.studentCode,
        daysStudied: s.attendance.presentDays + s.attendance.lateDays,
        attendanceRate: s.attendance.attendanceRate,
        byType,
      };
    });

    return NextResponse.json({
      status: "SUCCESS",
      workspaceName: report.workspaceName,
      totalConductedDays: report.totalConductedDays,
      totalScheduledDays: report.totalScheduledDays,
      students,
    });
  } catch (error) {
    console.error("Workspace analytics error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to compute analytics" },
      { status: 500 }
    );
  }
}
