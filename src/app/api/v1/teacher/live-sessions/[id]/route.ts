import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions, quizOptions, users, exams } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { orderByQuestionOrder } from "@/lib/live-quiz";

async function getHostedSession(request: NextRequest, teacherId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(liveSessions)
    .where(
      and(
        eq(liveSessions.id, sessionId),
        isAdminRequest(request) ? sql`TRUE` : eq(liveSessions.hostId, teacherId)
      )
    )
    .limit(1);
  return session ?? null;
}

async function getSessionQuestions(session: { examId: string; questionOrder: string[] | null }) {
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.examId, session.examId), eq(questions.type, "QUIZ")))
    .orderBy(questions.sortOrder, questions.id);
  return orderByQuestionOrder(rows, session.questionOrder);
}

// GET — host view: session state, participants/leaderboard, current question
// with correct answers and live answer distribution
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const session = await getHostedSession(request, teacherId, id);
    if (!session) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Live session not found" }, { status: 404 });
    }

    const [exam] = await db
      .select({ title: exams.title })
      .from(exams)
      .where(eq(exams.id, session.examId))
      .limit(1);

    const sessionQuestions = await getSessionQuestions(session);

    const participants = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        username: users.username,
        score: liveParticipants.score,
        currentQuestionIndex: liveParticipants.currentQuestionIndex,
        finishedAt: liveParticipants.finishedAt,
        joinedAt: liveParticipants.joinedAt,
      })
      .from(liveParticipants)
      .innerJoin(users, eq(users.id, liveParticipants.studentId))
      .where(eq(liveParticipants.sessionId, id))
      .orderBy(sql`${liveParticipants.score} DESC`, users.fullName);

    // Correct answer text per question, for the leaderboard answer key
    const allOptions = sessionQuestions.length
      ? await db
          .select({
            questionId: quizOptions.questionId,
            text: quizOptions.optionText,
            isCorrect: quizOptions.isCorrect,
          })
          .from(quizOptions)
          .where(
            inArray(
              quizOptions.questionId,
              sessionQuestions.map((q) => q.id)
            )
          )
          .orderBy(quizOptions.id)
      : [];
    const correctByQuestion = new Map<string, string[]>();
    for (const opt of allOptions) {
      if (!opt.isCorrect) continue;
      const list = correctByQuestion.get(opt.questionId) ?? [];
      list.push(opt.text);
      correctByQuestion.set(opt.questionId, list);
    }

    // Per-question detail for the leaderboard: every answer in the session
    const allAnswers = await db
      .select({
        studentId: liveAnswers.studentId,
        questionId: liveAnswers.questionId,
        isCorrect: liveAnswers.isCorrect,
        points: liveAnswers.points,
      })
      .from(liveAnswers)
      .where(eq(liveAnswers.sessionId, id));

    let currentQuestion = null;
    let answerDistribution: Record<string, number> = {};
    let answeredCount = 0;
    if (
      session.mode === "TEACHER" &&
      session.currentQuestionIndex >= 0 &&
      session.currentQuestionIndex < sessionQuestions.length
    ) {
      const q = sessionQuestions[session.currentQuestionIndex];
      const options = await db
        .select()
        .from(quizOptions)
        .where(eq(quizOptions.questionId, q.id));
      const answers = await db
        .select({ selectedOptions: liveAnswers.selectedOptions })
        .from(liveAnswers)
        .where(and(eq(liveAnswers.sessionId, id), eq(liveAnswers.questionId, q.id)));
      answeredCount = answers.length;
      for (const a of answers) {
        for (const optId of a.selectedOptions ?? []) {
          answerDistribution[optId] = (answerDistribution[optId] ?? 0) + 1;
        }
      }
      currentQuestion = {
        id: q.id,
        title: q.title,
        content: q.content,
        options: options.map((o) => ({ id: o.id, text: o.optionText, isCorrect: o.isCorrect })),
      };
    }

    const startedAtMs = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : null;
    const remainingSeconds =
      session.status === "QUESTION" && startedAtMs !== null
        ? Math.max(0, session.questionSeconds - Math.floor((Date.now() - startedAtMs) / 1000))
        : 0;

    return NextResponse.json({
      status: "SUCCESS",
      session: {
        id: session.id,
        joinCode: session.joinCode,
        status: session.status,
        mode: session.mode,
        showCorrectAnswer: session.showCorrectAnswer,
        shuffleQuestions: session.shuffleQuestions,
        shuffleOptions: session.shuffleOptions,
        currentQuestionIndex: session.currentQuestionIndex,
        questionSeconds: session.questionSeconds,
        remainingSeconds,
        totalQuestions: sessionQuestions.length,
        examTitle: exam?.title ?? "",
      },
      participants: participants.map((p) => ({
        ...p,
        finished: Boolean(p.finishedAt),
        progress: Math.min(p.currentQuestionIndex, sessionQuestions.length),
      })),
      questions: sessionQuestions.map((q) => ({
        id: q.id,
        title: q.title,
        correctAnswer: (correctByQuestion.get(q.id) ?? []).join(" · "),
      })),
      answers: allAnswers,
      currentQuestion,
      answerDistribution,
      answeredCount,
    });
  } catch (error) {
    console.error("Live session state error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch live session" },
      { status: 500 }
    );
  }
}

// POST — host controls: { action: "start" | "next" | "end" }
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

    const session = await getHostedSession(request, teacherId, id);
    if (!session) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Live session not found" }, { status: 404 });
    }
    if (session.status === "ENDED") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Session already ended" },
        { status: 409 }
      );
    }

    const { action } = await request.json();
    const sessionQuestions = await getSessionQuestions(session);

    // Student-paced sessions: the host only opens and closes the quiz;
    // each student advances on their own
    if (session.mode === "STUDENT" && action !== "end") {
      if (action !== "start") {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Students advance on their own in this mode" },
          { status: 400 }
        );
      }
      if (session.status !== "LOBBY") {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Session already started" },
          { status: 409 }
        );
      }
      const [updated] = await db
        .update(liveSessions)
        .set({ status: "QUESTION", currentQuestionIndex: 0, questionStartedAt: new Date() })
        .where(eq(liveSessions.id, id))
        .returning();
      return NextResponse.json({ status: "SUCCESS", session: updated });
    }

    if (action === "start" || action === "next") {
      const nextIndex = action === "start" ? 0 : session.currentQuestionIndex + 1;
      if (action === "start" && session.status !== "LOBBY") {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Session already started" },
          { status: 409 }
        );
      }
      if (nextIndex >= sessionQuestions.length) {
        await db.update(liveSessions).set({ status: "ENDED" }).where(eq(liveSessions.id, id));
        return NextResponse.json({ status: "SUCCESS", session: { status: "ENDED" } });
      }
      const [updated] = await db
        .update(liveSessions)
        .set({
          status: "QUESTION",
          currentQuestionIndex: nextIndex,
          questionStartedAt: new Date(),
        })
        .where(eq(liveSessions.id, id))
        .returning();
      return NextResponse.json({ status: "SUCCESS", session: updated });
    }

    if (action === "end") {
      const [updated] = await db
        .update(liveSessions)
        .set({ status: "ENDED" })
        .where(eq(liveSessions.id, id))
        .returning();
      return NextResponse.json({ status: "SUCCESS", session: updated });
    }

    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "action must be start, next or end" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Live session control error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to control live session" },
      { status: 500 }
    );
  }
}

// PATCH — edit session settings: { questionSeconds } (applies from the next question)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const session = await getHostedSession(request, teacherId, id);
    if (!session) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Live session not found" }, { status: 404 });
    }
    if (session.status === "ENDED") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Cannot edit an ended session" },
        { status: 409 }
      );
    }

    const { questionSeconds } = await request.json();
    if (!Number.isInteger(questionSeconds) || questionSeconds < 10 || questionSeconds > 300) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionSeconds must be an integer between 10 and 300" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(liveSessions)
      .set({ questionSeconds })
      .where(eq(liveSessions.id, id))
      .returning();
    return NextResponse.json({ status: "SUCCESS", session: updated });
  } catch (error) {
    console.error("Live session edit error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to edit live session" },
      { status: 500 }
    );
  }
}

// DELETE — remove a live session and its participants/answers (cascade)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const session = await getHostedSession(request, teacherId, id);
    if (!session) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Live session not found" }, { status: 404 });
    }

    await db.delete(liveSessions).where(eq(liveSessions.id, id));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Live session delete error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete live session" },
      { status: 500 }
    );
  }
}
