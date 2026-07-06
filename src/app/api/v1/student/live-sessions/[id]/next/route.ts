import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { orderByQuestionOrder } from "@/lib/live-quiz";

// POST — student-paced sessions only: move to the next question after
// answering the current one; finishing the last question marks the student done
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
    if (!session || session.status !== "QUESTION") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "The quiz is not running" },
        { status: 409 }
      );
    }
    if (session.mode !== "STUDENT") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "The teacher controls the pace in this session" },
        { status: 400 }
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
    if (me.finishedAt) {
      return NextResponse.json({ status: "SUCCESS", finished: true });
    }

    const sessionQuestions = orderByQuestionOrder(
      await db
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.examId, session.examId), eq(questions.type, "QUIZ")))
        .orderBy(questions.sortOrder, questions.id),
      session.questionOrder
    );

    const current = sessionQuestions[me.currentQuestionIndex];
    if (current) {
      const [answer] = await db
        .select({ id: liveAnswers.id })
        .from(liveAnswers)
        .where(
          and(
            eq(liveAnswers.sessionId, id),
            eq(liveAnswers.questionId, current.id),
            eq(liveAnswers.studentId, studentId)
          )
        )
        .limit(1);
      if (!answer) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Answer the current question first" },
          { status: 409 }
        );
      }
    }

    const nextIndex = me.currentQuestionIndex + 1;
    const finished = nextIndex >= sessionQuestions.length;
    await db
      .update(liveParticipants)
      .set({
        currentQuestionIndex: nextIndex,
        ...(finished ? { finishedAt: new Date() } : {}),
      })
      .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)));

    return NextResponse.json({ status: "SUCCESS", finished, currentQuestionIndex: nextIndex });
  } catch (error) {
    console.error("Live next question error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to advance" },
      { status: 500 }
    );
  }
}
