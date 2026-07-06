import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions, quizOptions, users, exams } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

// GET — participant view of the live session: lobby/question/result state,
// own answer status, score, rank and (when ended) the final leaderboard
export async function GET(
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
    if (!session) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Session not found" }, { status: 404 });
    }

    const [me] = await db
      .select()
      .from(liveParticipants)
      .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)))
      .limit(1);
    if (!me) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Join the session with its code first" },
        { status: 403 }
      );
    }

    const [exam] = await db
      .select({ title: exams.title })
      .from(exams)
      .where(eq(exams.id, session.examId))
      .limit(1);

    const sessionQuestions = await db
      .select({ id: questions.id, title: questions.title, content: questions.content })
      .from(questions)
      .where(and(eq(questions.examId, session.examId), eq(questions.type, "QUIZ")))
      .orderBy(questions.sortOrder, questions.id);

    const leaderboard = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        score: liveParticipants.score,
      })
      .from(liveParticipants)
      .innerJoin(users, eq(users.id, liveParticipants.studentId))
      .where(eq(liveParticipants.sessionId, id))
      .orderBy(sql`${liveParticipants.score} DESC`, users.fullName);
    const rank = leaderboard.findIndex((p) => p.studentId === studentId) + 1;

    const startedAtMs = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : null;
    const remainingSeconds =
      session.status === "QUESTION" && startedAtMs !== null
        ? Math.max(0, session.questionSeconds - Math.floor((Date.now() - startedAtMs) / 1000))
        : 0;

    let currentQuestion = null;
    let myAnswer: { isCorrect: boolean; points: number } | null = null;
    if (
      session.status === "QUESTION" &&
      session.currentQuestionIndex >= 0 &&
      session.currentQuestionIndex < sessionQuestions.length
    ) {
      const q = sessionQuestions[session.currentQuestionIndex];
      const options = await db
        .select({ id: quizOptions.id, text: quizOptions.optionText })
        .from(quizOptions)
        .where(eq(quizOptions.questionId, q.id));
      const [answer] = await db
        .select({ isCorrect: liveAnswers.isCorrect, points: liveAnswers.points })
        .from(liveAnswers)
        .where(
          and(
            eq(liveAnswers.sessionId, id),
            eq(liveAnswers.questionId, q.id),
            eq(liveAnswers.studentId, studentId)
          )
        )
        .limit(1);
      myAnswer = answer ?? null;
      currentQuestion = { id: q.id, title: q.title, content: q.content, options };
    }

    return NextResponse.json({
      status: "SUCCESS",
      session: {
        status: session.status,
        currentQuestionIndex: session.currentQuestionIndex,
        totalQuestions: sessionQuestions.length,
        remainingSeconds,
        questionSeconds: session.questionSeconds,
        examTitle: exam?.title ?? "",
        participantCount: leaderboard.length,
      },
      currentQuestion,
      myAnswer,
      myScore: me.score,
      myRank: rank,
      leaderboard: session.status === "ENDED" ? leaderboard.slice(0, 10) : leaderboard.slice(0, 5),
    });
  } catch (error) {
    console.error("Live session participant state error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
