import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, submissionDetails, questions, users, exams } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";

// GET — all TEXT question answers across submitted attempts, for teacher grading
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id: examId } = await params;

    const [exam] = await db
      .select()
      .from(exams)
      .where(
        and(
          eq(exams.id, examId),
          isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId)
        )
      )
      .limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const textQuestions = await db
      .select({ id: questions.id, title: questions.title, content: questions.content, points: questions.points, sortOrder: questions.sortOrder })
      .from(questions)
      .where(and(eq(questions.examId, examId), eq(questions.type, "TEXT")))
      .orderBy(questions.sortOrder, questions.id);

    if (textQuestions.length === 0) {
      return NextResponse.json({ status: "SUCCESS", examTitle: exam.title, questions: [], submissions: [] });
    }

    const submissions = await db
      .select({
        submissionId: examSubmissions.id,
        studentId: examSubmissions.studentId,
        studentName: users.fullName,
        username: users.username,
        attempt: examSubmissions.attempt,
        submittedAt: examSubmissions.submittedAt,
        totalScore: examSubmissions.totalScore,
      })
      .from(examSubmissions)
      .innerJoin(users, eq(users.id, examSubmissions.studentId))
      .where(and(eq(examSubmissions.examId, examId), isNotNull(examSubmissions.submittedAt)))
      .orderBy(users.fullName, examSubmissions.attempt);

    const subIds = submissions.map((s) => s.submissionId);
    const textQIds = textQuestions.map((q) => q.id);

    let answers: any[] = [];
    if (subIds.length > 0 && textQIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      answers = await db
        .select({
          submissionId: submissionDetails.submissionId,
          questionId: submissionDetails.questionId,
          textAnswer: submissionDetails.textAnswer,
          score: submissionDetails.score,
          gradedAt: submissionDetails.gradedAt,
        })
        .from(submissionDetails)
        .where(
          and(
            inArray(submissionDetails.submissionId, subIds),
            inArray(submissionDetails.questionId, textQIds)
          )
        );
    }

    return NextResponse.json({
      status: "SUCCESS",
      examTitle: exam.title,
      questions: textQuestions,
      submissions,
      answers,
    });
  } catch (error) {
    console.error("Grading fetch error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to fetch grading data" }, { status: 500 });
  }
}

// POST — teacher grades a single TEXT answer and recalculates total score
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id: examId } = await params;

    const [exam] = await db
      .select()
      .from(exams)
      .where(
        and(
          eq(exams.id, examId),
          isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId)
        )
      )
      .limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const { submissionId, questionId, score } = await request.json();
    if (!submissionId || !questionId || score === undefined || score === null) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "submissionId, questionId, and score are required" },
        { status: 400 }
      );
    }

    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Score must be a non-negative number" },
        { status: 400 }
      );
    }

    const [question] = await db
      .select({ points: questions.points })
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.examId, examId), eq(questions.type, "TEXT")))
      .limit(1);
    if (!question) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "TEXT question not found in this exam" },
        { status: 404 }
      );
    }

    const maxPoints = parseFloat(question.points as string) || 0;
    if (numScore > maxPoints) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: `Score cannot exceed ${maxPoints} points` },
        { status: 400 }
      );
    }

    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(and(eq(examSubmissions.id, submissionId), eq(examSubmissions.examId, examId), isNotNull(examSubmissions.submittedAt)))
      .limit(1);
    if (!submission) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Submitted attempt not found" },
        { status: 404 }
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(submissionDetails)
        .set({
          score: numScore.toFixed(2),
          gradedBy: teacherId,
          gradedAt: new Date(),
        })
        .where(
          and(
            eq(submissionDetails.submissionId, submissionId),
            eq(submissionDetails.questionId, questionId)
          )
        );

      const [scoreResult] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${submissionDetails.score}), 0)` })
        .from(submissionDetails)
        .where(eq(submissionDetails.submissionId, submissionId));

      const examQuestions = await tx
        .select({ points: questions.points })
        .from(questions)
        .where(eq(questions.examId, examId));
      const maxPossible = examQuestions.reduce((sum, q) => sum + (parseFloat(q.points as string) || 0), 0);

      const newTotal = Math.max(0, Math.min(parseFloat(scoreResult.total), maxPossible));

      await tx
        .update(examSubmissions)
        .set({ totalScore: newTotal.toFixed(2) })
        .where(eq(examSubmissions.id, submissionId));
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Grading submit error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to grade answer" }, { status: 500 });
  }
}
