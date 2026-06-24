import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, questions } from "@/db/schema";
import { eq, and, isNotNull, isNull, sum, count } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: studentId } = await params;

    // Fetch all submissions for this student on exams created by this teacher
    const submissions = await db
      .select({
        submissionId: examSubmissions.id,
        examId: examSubmissions.examId,
        examTitle: exams.title,
        examDuration: exams.duration,
        startAt: examSubmissions.startAt,
        submittedAt: examSubmissions.submittedAt,
        totalScore: examSubmissions.totalScore,
        focusLossCount: examSubmissions.focusLossCount,
        attempt: examSubmissions.attempt,
        allowedAttempts: exams.allowedAttempts,
      })
      .from(examSubmissions)
      .innerJoin(exams, eq(examSubmissions.examId, exams.id))
      .where(
        and(
          eq(examSubmissions.studentId, studentId),
          eq(exams.createdBy, teacherId)
        )
      )
      .orderBy(examSubmissions.startAt);

    // Calculate max possible score per exam (sum of question points)
    const examIds = [...new Set(submissions.map((s) => s.examId))];
    const maxScores: Record<string, number> = {};
    for (const examId of examIds) {
      const [result] = await db
        .select({ total: sum(questions.points) })
        .from(questions)
        .where(eq(questions.examId, examId));
      maxScores[examId] = parseFloat((result?.total as string) || "0");
    }

    // Group by exam, keeping all attempts
    const examMap: Record<string, any> = {};
    for (const sub of submissions) {
      if (!examMap[sub.examId]) {
        examMap[sub.examId] = {
          examId: sub.examId,
          examTitle: sub.examTitle,
          examDuration: sub.examDuration,
          allowedAttempts: sub.allowedAttempts,
          maxScore: maxScores[sub.examId] ?? 0,
          attempts: [],
        };
      }
      examMap[sub.examId].attempts.push({
        submissionId: sub.submissionId,
        attempt: sub.attempt,
        startAt: sub.startAt,
        submittedAt: sub.submittedAt,
        totalScore: sub.submittedAt ? parseFloat(sub.totalScore as string || "0") : null,
        focusLossCount: sub.focusLossCount,
        status: sub.submittedAt ? "SUBMITTED" : "IN_PROGRESS",
      });
    }

    return NextResponse.json({
      status: "SUCCESS",
      exams: Object.values(examMap),
    });
  } catch (error) {
    console.error("Fetch student exam history error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch exam history" },
      { status: 500 }
    );
  }
}
