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

    // 1. Fetch all exams
    const allExams = await db
      .select()
      .from(exams)
      .orderBy(desc(exams.startTime));

    // 2. Fetch assignments for this student
    const assignments = await db
      .select({ examId: examAssignments.examId })
      .from(examAssignments)
      .where(eq(examAssignments.studentId, studentId));
    const assignedExamIds = new Set(assignments.map(a => a.examId));

    // 3. Filter exams by access permissions
    const accessibleExams = allExams.filter(
      exam => exam.accessType === "ALL" || assignedExamIds.has(exam.id)
    );

    // 4. Fetch student submissions including active-time tracking fields
    const submissions = await db
      .select({
        examId: examSubmissions.examId,
        submittedAt: examSubmissions.submittedAt,
        closeReason: examSubmissions.closeReason,
        activeSeconds: examSubmissions.activeSeconds,
      })
      .from(examSubmissions)
      .where(eq(examSubmissions.studentId, studentId));

    // Group submissions by examId
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

      // The active (not-yet-submitted) attempt, if any
      const activeAttempt = examSubmissionsList.find(s => s.submittedAt === null) ?? null;

      // Find last submitted timestamp if any
      const lastSubmitted = completedAttempts.length > 0
        ? completedAttempts.reduce((latest, current) =>
            (current.submittedAt && latest.submittedAt && current.submittedAt > latest.submittedAt) ? current : latest
          )
        : null;

      const examClosed = now > exam.endTime;

      return {
        ...exam,
        hasSubmitted,
        hasActiveAttempt: activeAttempt !== null,
        // If close date passed and there's an unsubmitted attempt → system cancels it
        activeAttemptCancelled: activeAttempt !== null && examClosed,
        activeAttemptPaused: activeAttempt !== null && !examClosed && activeAttempt.closeReason === "SAVE_AND_EXIT",
        activeSeconds: activeAttempt?.activeSeconds ?? 0,
        attemptsCount,
        allowedAttempts: exam.allowedAttempts,
        submittedAt: lastSubmitted?.submittedAt || null,
        isActive: now >= exam.startTime && now <= exam.endTime,
      };
    });

    return NextResponse.json({ status: "SUCCESS", exams: annotatedExams });
  } catch (error) {
    console.error("Fetch student exams error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch exams" },
      { status: 500 }
    );
  }
}
