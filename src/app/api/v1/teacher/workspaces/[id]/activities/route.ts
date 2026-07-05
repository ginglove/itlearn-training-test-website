import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, exams, teachingDays } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

const VALID_TYPES = ["EXERCISE", "HOMEWORK", "ASSESSMENT", "QUIZ"] as const;
type ActivityType = (typeof VALID_TYPES)[number];
const EXAM_REQUIRED: ActivityType[] = ["QUIZ", "ASSESSMENT"];

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

    const rows = await db
      .select({
        activity: workspaceActivities,
        examTitle: exams.title,
        dayNumber: teachingDays.dayNumber,
      })
      .from(workspaceActivities)
      .leftJoin(exams, eq(exams.id, workspaceActivities.examId))
      .leftJoin(teachingDays, eq(teachingDays.id, workspaceActivities.teachingDayId))
      .where(eq(workspaceActivities.workspaceId, id))
      .orderBy(workspaceActivities.assignedAt);

    return NextResponse.json({
      status: "SUCCESS",
      activities: rows.map((r) => ({
        ...r.activity,
        examTitle: r.examTitle,
        dayNumber: r.dayNumber,
      })),
    });
  } catch (error) {
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { activityType, title, description, examId, teachingDayId, dueDate } = body;

    if (!VALID_TYPES.includes(activityType)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid activityType" },
        { status: 400 }
      );
    }
    if (!title || !String(title).trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "title is required" },
        { status: 400 }
      );
    }
    if (EXAM_REQUIRED.includes(activityType) && !examId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: `${activityType} activities require an examId` },
        { status: 400 }
      );
    }

    if (examId) {
      // Exam must exist and belong to this teacher
      const [exam] = await db
        .select({ id: exams.id })
        .from(exams)
        .where(and(eq(exams.id, examId), (isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId))))
        .limit(1);
      if (!exam) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Exam not found or not owned by you" },
          { status: 400 }
        );
      }
      const [duplicate] = await db
        .select({ id: workspaceActivities.id })
        .from(workspaceActivities)
        .where(
          and(eq(workspaceActivities.workspaceId, id), eq(workspaceActivities.examId, examId))
        )
        .limit(1);
      if (duplicate) {
        return NextResponse.json(
          {
            error: "DUPLICATE_EXAM_IN_WORKSPACE",
            message: "This exam is already assigned to this workspace",
          },
          { status: 409 }
        );
      }
    }

    if (teachingDayId) {
      const [day] = await db
        .select({ id: teachingDays.id })
        .from(teachingDays)
        .where(and(eq(teachingDays.id, teachingDayId), eq(teachingDays.workspaceId, id)))
        .limit(1);
      if (!day) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Teaching day not found in this workspace" },
          { status: 400 }
        );
      }
    }

    const [activity] = await db
      .insert(workspaceActivities)
      .values({
        workspaceId: id,
        examId: examId || null,
        teachingDayId: teachingDayId || null,
        activityType,
        title: String(title).trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      })
      .returning();

    return NextResponse.json({ status: "SUCCESS", activity }, { status: 201 });
  } catch (error) {
    console.error("Assign activity error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to assign activity" },
      { status: 500 }
    );
  }
}
