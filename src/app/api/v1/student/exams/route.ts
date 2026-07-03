import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, examAssignments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const allExams = await db.select().from(exams).orderBy(desc(exams.startTime));

    const assignments = await db
      .select({ examId: examAssignments.examId })
      .from(examAssignments)
      .where(eq(examAssignments.studentId, studentId));
    const assignedExamIds = new Set(assignments.map(a => a.examId));

    const accessibleExams = allExams.filter(
      exam => exam.accessType === "ALL" || assignedExamIds.has(exam.id)
    );

    const submissions = await db
      .select({
        examId: examSubmissions.examId,
        submittedAt: examSubmissions.submittedAt,
        closeReason: examSubmissions.closeReason,
        activeSeconds: examSubmissions.activeSeconds,
      })
      .from(examSubmissions)
      .where(eq(examSubmissions.studentId, studentId));

    const submissionGroups = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const list = submissionGroups.get(sub.examId) || [];
      list.push(sub);
      submissionGroups.set(sub.examId, list);
    }

    const now = new Date();

    const annotatedExams = accessibleExams.map(exam => {
      const examSubmissionsList = submissionGroups.get(exam.id) || [];
      const completedAttempts = examSubmissionsList.filter(s => s.submittedAt !== null);
      const attemptsCount = completedAttempts.length;
      const hasSubmitted = attemptsCount > 0;
      const activeAttempt = examSubmissionsList.find(s => s.submittedAt === null) ?? null;

      const lastSubmitted = completedAttempts.length > 0
        ? completedAttempts.reduce((latest, current) =>
            (current.submittedAt && latest.submittedAt && current.submittedAt > latest.submittedAt) ? current : latest
          )
        : null;

      const examClosed = now > exam.endTime;

      // #7 + #1: Unified submissionStatus using priority rules (Rule 15)
      let submissionStatus: "SUBMITTED" | "IN_PROGRESS" | "PENDING" | "CANCELLED" | null = null;
      if (activeAttempt) {
        if (examClosed) {
          submissionStatus = "CANCELLED";
        } else if (activeAttempt.closeReason === "SAVE_AND_EXIT") {
          submissionStatus = "PENDING";
        } else {
          submissionStatus = "IN_PROGRESS";
        }
      }

      return {
        ...exam,
        hasSubmitted,
        attemptsCount,
        allowedAttempts: exam.allowedAttempts,
        submittedAt: lastSubmitted?.submittedAt || null,
        isActive: now >= exam.startTime && now <= exam.endTime,
        // Unified status field (v7.3+)
        submissionStatus,
        activeSeconds: activeAttempt?.activeSeconds ?? 0,
        // Deprecated in v7.3 — kept for backwards compatibility, remove in v8.0
        hasActiveAttempt: activeAttempt !== null,
        activeAttemptCancelled: activeAttempt !== null && examClosed,
        activeAttemptPaused: activeAttempt !== null && !examClosed && activeAttempt.closeReason === "SAVE_AND_EXIT",
      };
    });

    return NextResponse.json({ status: "SUCCESS", exams: annotatedExams });
  } catch (error) {
    console.error("Fetch student exams error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to fetch exams" }, { status: 500 });
  }
}
