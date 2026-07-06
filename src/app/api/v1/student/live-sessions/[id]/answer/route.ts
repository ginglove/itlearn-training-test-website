import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions, quizOptions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

// POST — answer the current question. Score = 500 base + up to 500 speed bonus
// for a fully correct answer; one answer per question, locked once given.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const [session] = await db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, id))
      .limit(1);
    if (!session || session.status !== "QUESTION" || !session.questionStartedAt) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "No question is open right now" },
        { status: 409 }
      );
    }

    const [me] = await db
      .select()
      .from(liveParticipants)
      .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)))
      .limit(1);
    if (!me) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Join the session first" },
        { status: 403 }
      );
    }

    const elapsedMs = Date.now() - new Date(session.questionStartedAt).getTime();
    const totalMs = session.questionSeconds * 1000;
    if (elapsedMs > totalMs + 1500) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Time is up for this question" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { questionId } = body;
    const selectedOptions: string[] = Array.isArray(body.selectedOptions)
      ? body.selectedOptions.map(String)
      : [];
    if (!questionId || selectedOptions.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId and selectedOptions are required" },
        { status: 400 }
      );
    }

    // The answered question must be the currently open one
    const sessionQuestions = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.examId, session.examId), eq(questions.type, "QUIZ")))
      .orderBy(questions.sortOrder, questions.id);
    const current = sessionQuestions[session.currentQuestionIndex];
    if (!current || current.id !== questionId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "That question is not open" },
        { status: 409 }
      );
    }

    const options = await db
      .select({ id: quizOptions.id, isCorrect: quizOptions.isCorrect })
      .from(quizOptions)
      .where(eq(quizOptions.questionId, questionId));
    const validIds = new Set(options.map((o) => o.id));
    if (selectedOptions.some((optId) => !validIds.has(optId))) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid option selected" },
        { status: 400 }
      );
    }

    const correctIds = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));
    const selectedSet = new Set(selectedOptions);
    const isCorrect =
      correctIds.size === selectedSet.size && [...correctIds].every((c) => selectedSet.has(c));

    // Speed-based scoring: full marks near-instant, halving toward the deadline
    const remainingRatio = Math.max(0, Math.min(1, 1 - elapsedMs / totalMs));
    const points = isCorrect ? Math.round(500 + 500 * remainingRatio) : 0;

    try {
      await db.insert(liveAnswers).values({
        sessionId: id,
        questionId,
        studentId,
        selectedOptions,
        isCorrect,
        points,
      });
    } catch {
      // Unique constraint: already answered this question
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "You already answered this question" },
        { status: 409 }
      );
    }

    if (points > 0) {
      await db
        .update(liveParticipants)
        .set({ score: sql`${liveParticipants.score} + ${points}` })
        .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)));
    }

    return NextResponse.json({ status: "SUCCESS", isCorrect, points });
  } catch (error) {
    console.error("Live answer error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to submit answer" },
      { status: 500 }
    );
  }
}
