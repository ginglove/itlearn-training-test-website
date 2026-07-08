import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions, quizOptions, users, exams, xpathConfigs, xpathTestCases } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { orderByQuestionOrder, shuffleOptionsForStudent } from "@/lib/live-quiz";

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

    const sessionQuestions = orderByQuestionOrder(
      await db
        .select({ id: questions.id, type: questions.type, title: questions.title, content: questions.content })
        .from(questions)
        .where(eq(questions.examId, session.examId))
        .orderBy(questions.sortOrder, questions.id),
      session.questionOrder
    );

    const leaderboard = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        score: liveParticipants.score,
        totalTimeMs: liveParticipants.totalTimeMs,
      })
      .from(liveParticipants)
      .innerJoin(users, eq(users.id, liveParticipants.studentId))
      .where(eq(liveParticipants.sessionId, id))
      .orderBy(sql`${liveParticipants.score} DESC`, sql`${liveParticipants.totalTimeMs} ASC`, users.fullName);
    const rank = leaderboard.findIndex((p) => p.studentId === studentId) + 1;

    const startedAtMs = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : null;
    // Student-paced sessions have no per-question countdown
    const remainingSeconds =
      session.mode === "TEACHER" && session.status === "QUESTION" && startedAtMs !== null
        ? Math.max(0, session.questionSeconds - Math.floor((Date.now() - startedAtMs) / 1000))
        : 0;

    // Which question this student is on: shared index in teacher-paced mode,
    // their own pointer in student-paced mode
    const myIndex =
      session.mode === "STUDENT" ? me.currentQuestionIndex : session.currentQuestionIndex;
    const finished = session.mode === "STUDENT" && (Boolean(me.finishedAt) || myIndex >= sessionQuestions.length);

    let currentQuestion: any = null;
    let myAnswer: { isCorrect: boolean | null; points: number | null } | null = null;
    let correctOptionIds: string[] | null = null;
    if (
      session.status === "QUESTION" &&
      !finished &&
      myIndex >= 0 &&
      myIndex < sessionQuestions.length
    ) {
      const q = sessionQuestions[myIndex];
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
      if (answer) {
        myAnswer = session.showCorrectAnswer
          ? answer
          : { isCorrect: null, points: null };
      }

      if (q.type === "QUIZ") {
        let options = await db
          .select({ id: quizOptions.id, text: quizOptions.optionText, isCorrect: quizOptions.isCorrect })
          .from(quizOptions)
          .where(eq(quizOptions.questionId, q.id))
          .orderBy(quizOptions.id);
        if (session.shuffleOptions) {
          options = shuffleOptionsForStudent(options, studentId, q.id);
        }
        if (answer && session.showCorrectAnswer) {
          correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
        }
        currentQuestion = {
          id: q.id,
          type: q.type,
          title: q.title,
          content: q.content,
          options: options.map((o) => ({ id: o.id, text: o.text })),
        };
      } else if (q.type === "XPATH") {
        // Selector type + first visible test case's target, for the workspace preview
        const [config] = await db
          .select({ selectorType: xpathConfigs.selectorType })
          .from(xpathConfigs)
          .where(eq(xpathConfigs.questionId, q.id))
          .limit(1);
        const [firstCase] = await db
          .select({
            targetType: xpathTestCases.targetType,
            targetPayload: xpathTestCases.targetPayload,
          })
          .from(xpathTestCases)
          .where(and(eq(xpathTestCases.questionId, q.id), eq(xpathTestCases.isHidden, false)))
          .orderBy(xpathTestCases.id)
          .limit(1);
        currentQuestion = {
          id: q.id,
          type: q.type,
          title: q.title,
          content: q.content,
          options: [],
          selectorType: config?.selectorType ?? "XPATH",
          targetType: firstCase?.targetType ?? null,
          targetPayload: firstCase?.targetPayload ?? null,
        };
      } else {
        currentQuestion = {
          id: q.id,
          type: q.type,
          title: q.title,
          content: q.content,
          options: [],
        };
      }
    }

    // Question-by-question breakdown of the student's own results, shown once
    // the session has ended
    let myBreakdown:
      | { title: string; type: string; answered: boolean; isCorrect: boolean; points: number }[]
      | null = null;
    if (session.status === "ENDED") {
      const myAnswers = await db
        .select({
          questionId: liveAnswers.questionId,
          isCorrect: liveAnswers.isCorrect,
          points: liveAnswers.points,
        })
        .from(liveAnswers)
        .where(and(eq(liveAnswers.sessionId, id), eq(liveAnswers.studentId, studentId)));
      const byQuestion = new Map(myAnswers.map((a) => [a.questionId, a]));
      myBreakdown = sessionQuestions.map((q) => {
        const a = byQuestion.get(q.id);
        return {
          title: q.title,
          type: q.type,
          answered: Boolean(a),
          isCorrect: a?.isCorrect ?? false,
          points: a?.points ?? 0,
        };
      });
    }

    return NextResponse.json({
      status: "SUCCESS",
      session: {
        status: session.status,
        mode: session.mode,
        showCorrectAnswer: session.showCorrectAnswer,
        currentQuestionIndex: myIndex,
        totalQuestions: sessionQuestions.length,
        remainingSeconds,
        questionSeconds: session.questionSeconds,
        examTitle: exam?.title ?? "",
        participantCount: leaderboard.length,
      },
      finished,
      correctOptionIds,
      myBreakdown,
      currentQuestion,
      myAnswer,
      myScore: me.score,
      myTotalTimeMs: me.totalTimeMs,
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
