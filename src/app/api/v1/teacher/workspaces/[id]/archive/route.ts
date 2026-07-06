import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  workspaces,
  workspaceActivities,
  examSubmissions,
  workspaceMemberships,
  teachingDays,
  attendanceRecords,
  exams,
} from "@/db/schema";
import { and, eq, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// W8: archive pre-check — no IN_PROGRESS submissions, all past days have roll call
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
        { error: "WORKSPACE_ARCHIVED", message: "Workspace is already archived" },
        { status: 409 }
      );
    }

    const blockingItems: string[] = [];

    // 1. In-progress submissions for exam-backed activities of active members
    const activities = await db
      .select({ examId: workspaceActivities.examId, title: workspaceActivities.title })
      .from(workspaceActivities)
      .where(and(eq(workspaceActivities.workspaceId, id), isNotNull(workspaceActivities.examId)));

    const examIds = activities.map((a) => a.examId!).filter(Boolean);
    if (examIds.length > 0) {
      const members = await db
        .select({ studentId: workspaceMemberships.studentId })
        .from(workspaceMemberships)
        .where(and(eq(workspaceMemberships.workspaceId, id), eq(workspaceMemberships.status, "ACTIVE")));
      const memberIds = members.map((m) => m.studentId);

      if (memberIds.length > 0) {
        // Rule 15: unsubmitted + window closed = CANCELLED, SAVE_AND_EXIT = PENDING;
        // only true IN_PROGRESS submissions block archiving (W8.1)
        const inProgress = await db
          .select({ examId: examSubmissions.examId, studentId: examSubmissions.studentId })
          .from(examSubmissions)
          .innerJoin(exams, eq(exams.id, examSubmissions.examId))
          .where(
            and(
              inArray(examSubmissions.examId, examIds),
              inArray(examSubmissions.studentId, memberIds),
              isNull(examSubmissions.submittedAt),
              sql`${exams.endTime} >= NOW()`,
              sql`(${examSubmissions.closeReason} IS NULL OR ${examSubmissions.closeReason} <> 'SAVE_AND_EXIT')`
            )
          );
        for (const s of inProgress) {
          blockingItems.push(`IN_PROGRESS submission (exam ${s.examId}, student ${s.studentId})`);
        }
      }
    }

    // 2. Past teaching days without any roll call record
    const today = new Date().toISOString().slice(0, 10);
    const missingRollCall = await db
      .select({ dayNumber: teachingDays.dayNumber, scheduledDate: teachingDays.scheduledDate })
      .from(teachingDays)
      .where(
        and(
          eq(teachingDays.workspaceId, id),
          lte(teachingDays.scheduledDate, today),
          sql`NOT EXISTS (SELECT 1 FROM ${attendanceRecords} WHERE ${attendanceRecords.teachingDayId} = ${teachingDays.id})`
        )
      );
    for (const d of missingRollCall) {
      blockingItems.push(`Day ${d.dayNumber} (${d.scheduledDate}) has no roll call record`);
    }

    if (blockingItems.length > 0) {
      return NextResponse.json(
        {
          error: "WORKSPACE_ARCHIVE_BLOCKED",
          message: "Archive pre-check failed",
          blockingItems,
        },
        { status: 409 }
      );
    }

    const [updated] = await db
      .update(workspaces)
      .set({ status: "ARCHIVED" })
      .where(eq(workspaces.id, id))
      .returning();

    return NextResponse.json({ status: "SUCCESS", workspace: updated });
  } catch (error) {
    console.error("Archive workspace error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to archive workspace" },
      { status: 500 }
    );
  }
}
