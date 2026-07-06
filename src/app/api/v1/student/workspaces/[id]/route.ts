import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { getMemberWorkspace } from "@/lib/workspace";
import { buildStudentActivityList } from "@/lib/workspace-report";

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

    const activities = await buildStudentActivityList(id, studentId);

    return NextResponse.json({ status: "SUCCESS", workspace, activities });
  } catch (error) {
    console.error("Student workspace detail error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch workspace" },
      { status: 500 }
    );
  }
}
