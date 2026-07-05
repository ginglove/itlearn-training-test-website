import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceActivities, exams, teachingDays } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";
import { activityTypeFromSession } from "@/lib/workspace-report";

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
        examSessionType: exams.sessionType,
        dayNumber: teachingDays.dayNumber,
      })
      .from(workspaceActivities)
      .leftJoin(exams, eq(exams.id, workspaceActivities.examId))
      .leftJoin(teachingDays, eq(teachingDays.id, workspaceActivities.teachingDayId))
      .where(eq(workspaceActivities.workspaceId, id))
      .orderBy(workspaceActivities.assignedAt);

    // Exam-backed activities always follow the exam's session type. Persist any
    // drift lazily so exports and raw queries stay consistent too.
    const result = rows.map((r) => {
      const derivedType = r.activity.examId
        ? activityTypeFromSession(r.examSessionType ?? "QUIZ")
        : r.activity.activityType;
      return { row: r, derivedType };
    });
    const stale = result.filter((r) => r.row.activity.activityType !== r.derivedType);
    for (const r of stale) {
      await db
        .update(workspaceActivities)
        .set({ activityType: r.derivedType })
        .where(eq(workspaceActivities.id, r.row.activity.id));
    }

    return NextResponse.json({
      status: "SUCCESS",
      activities: result.map(({ row: r, derivedType }) => ({
        ...r.activity,
        activityType: derivedType,
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

    const bulkRequest = Array.isArray(body.examIds) && body.examIds.length > 0;
    if (!bulkRequest && !VALID_TYPES.includes(activityType)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid activityType" },
        { status: 400 }
      );
    }

    // Bulk exam assignment: one activity per exam, titled after the exam.
    // Already-assigned exams are skipped and reported.
    const examIds: string[] = Array.isArray(body.examIds) ? body.examIds : [];
    if (examIds.length > 0) {
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

      const ownedExams = await db
        .select({ id: exams.id, title: exams.title, sessionType: exams.sessionType })
        .from(exams)
        .where(
          and(
            inArray(exams.id, examIds),
            isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId)
          )
        );
      const ownedById = new Map(ownedExams.map((e) => [e.id, e]));
      const notOwned = examIds.filter((eid) => !ownedById.has(eid));

      const existing = await db
        .select({ examId: workspaceActivities.examId })
        .from(workspaceActivities)
        .where(
          and(
            eq(workspaceActivities.workspaceId, id),
            inArray(workspaceActivities.examId, examIds)
          )
        );
      const alreadyAssigned = new Set(existing.map((e) => e.examId));

      // Each exam's session type determines the activity type:
      // QUIZ→QUIZ, FINAL→ASSESSMENT, PRACTICE→EXERCISE, HOMEWORK→HOMEWORK
      const typeFromSession = (sessionType: string) =>
        (({ QUIZ: "QUIZ", FINAL: "ASSESSMENT", PRACTICE: "EXERCISE", HOMEWORK: "HOMEWORK" }) as const)[
          sessionType as "QUIZ" | "FINAL" | "PRACTICE" | "HOMEWORK"
        ] ?? "QUIZ";

      const toCreate = examIds.filter((eid) => ownedById.has(eid) && !alreadyAssigned.has(eid));
      if (toCreate.length > 0) {
        await db.insert(workspaceActivities).values(
          toCreate.map((eid) => ({
            workspaceId: id,
            examId: eid,
            teachingDayId: teachingDayId || null,
            activityType: typeFromSession(ownedById.get(eid)!.sessionType),
            title: ownedById.get(eid)!.title,
            description: description || null,
            dueDate: dueDate ? new Date(dueDate) : null,
          }))
        );
      }

      return NextResponse.json(
        {
          status: "SUCCESS",
          created: toCreate,
          skipped: [
            ...[...alreadyAssigned].map((eid) => ({ examId: eid, reason: "DUPLICATE_EXAM_IN_WORKSPACE" })),
            ...notOwned.map((eid) => ({ examId: eid, reason: "EXAM_NOT_FOUND" })),
          ],
        },
        { status: 201 }
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
