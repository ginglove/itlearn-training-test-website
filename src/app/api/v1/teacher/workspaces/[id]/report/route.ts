import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceClassReports } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";
import { buildWorkspaceReport } from "@/lib/workspace-report";

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
    if (workspace.status !== "ARCHIVED") {
      return NextResponse.json(
        {
          error: "WORKSPACE_REPORT_NOT_ARCHIVED",
          message: "Workspace must be archived before generating the report",
        },
        { status: 400 }
      );
    }

    const reportData = await buildWorkspaceReport(id);

    const [report] = await db
      .insert(workspaceClassReports)
      .values({
        workspaceId: id,
        generatedBy: teacherId,
        totalScheduledDays: reportData.totalScheduledDays,
        totalConductedDays: reportData.totalConductedDays,
        reportData,
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", report }, { status: 201 });
  } catch (error) {
    console.error("Generate report error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to generate report" },
      { status: 500 }
    );
  }
}

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

    return NextResponse.json({ status: "SUCCESS", report });
  } catch (error) {
    console.error("Get report error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch report" },
      { status: 500 }
    );
  }
}
