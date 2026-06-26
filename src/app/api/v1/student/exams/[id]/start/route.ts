import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, exams, examAssignments } from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.id, examId));

    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const now = new Date();
    if (now < exam.startTime || now > exam.endTime) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Exam is not active" }, { status: 403 });
    }

    // 1. Enforce access control permissions check
    if (exam.accessType === "RESTRICTED") {
      const [assignment] = await db
        .select()
        .from(examAssignments)
        .where(
          and(
            eq(examAssignments.examId, examId),
            eq(examAssignments.studentId, studentId)
          )
        )
        .limit(1);

      if (!assignment) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You are not assigned to this exam" }, { status: 403 });
      }
    }

    // 2. Check for active (unsubmitted) attempt
    const [activeSubmission] = await db
      .select()
      .from(examSubmissions)
      .where(
        and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, studentId),
          isNull(examSubmissions.submittedAt)
        )
      )
      .limit(1);

    if (activeSubmission) {
      return NextResponse.json({
        status: "SUCCESS",
        submissionId: activeSubmission.id,
        startAt: activeSubmission.startAt,
        examDuration: exam.duration,
      });
    }

    // 3. Count completed attempts
    const completedSubmissions = await db
      .select()
      .from(examSubmissions)
      .where(
        and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, studentId),
          isNotNull(examSubmissions.submittedAt)
        )
      );

    const completedCount = completedSubmissions.length;
    if (completedCount >= exam.allowedAttempts) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Maximum attempt limit reached for this exam" }, { status: 403 });
    }

    const nextAttempt = completedCount + 1;

    // Bind IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const [newSubmission] = await db
      .insert(examSubmissions)
      .values({
        examId,
        studentId,
        clientIp,
        attempt: nextAttempt,
      })
      .returning();

    return NextResponse.json({
      status: "SUCCESS",
      submissionId: newSubmission.id,
      startAt: newSubmission.startAt,
      examDuration: exam.duration,
    });
  } catch (error) {
    console.error("Start exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to start exam" },
      { status: 500 }
    );
  }
}
