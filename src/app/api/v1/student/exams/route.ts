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

    // 3. Filter exams by access permissions (either public ALL or student is assigned)
    const accessibleExams = allExams.filter(
      exam => exam.accessType === "ALL" || assignedExamIds.has(exam.id)
    );

    // 4. Fetch student submissions
    const submissions = await db
      .select({ 
        examId: examSubmissions.examId, 
        submittedAt: examSubmissions.submittedAt 
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

    const annotatedExams = accessibleExams.map(exam => {
      const examSubmissionsList = submissionGroups.get(exam.id) || [];
      const completedAttempts = examSubmissionsList.filter(s => s.submittedAt !== null);
      const attemptsCount = completedAttempts.length;
      const hasSubmitted = attemptsCount > 0;
      const hasActiveAttempt = examSubmissionsList.some(s => s.submittedAt === null);

      // Find last submitted timestamp if any
      const lastSubmitted = completedAttempts.length > 0 
        ? completedAttempts.reduce((latest, current) => 
            (current.submittedAt && latest.submittedAt && current.submittedAt > latest.submittedAt) ? current : latest
          )
        : null;

      return {
        ...exam,
        hasSubmitted,
        hasActiveAttempt,
        attemptsCount,
        allowedAttempts: exam.allowedAttempts,
        submittedAt: lastSubmitted?.submittedAt || null,
        isActive: new Date() >= exam.startTime && new Date() <= exam.endTime,
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
