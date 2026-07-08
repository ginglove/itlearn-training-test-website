import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, liveAnswers, questions, quizOptions, xpathConfigs, xpathTestCases } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { orderByQuestionOrder } from "@/lib/live-quiz";
import { gradeXPathQuestion, type SelectorType } from "@/lib/grading/xpath-evaluator";

// POST — answer the current question. QUIZ: speed-scored. XPATH: graded against
// the question's test cases, speed-scored by pass percentage. TEXT/CODE: recorded, scored 0.
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
    if (session.mode === "TEACHER" && elapsedMs > totalMs + 1500) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Time is up for this question" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { questionId } = body;
    if (!questionId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId is required" },
        { status: 400 }
      );
    }

    const sessionQuestions = orderByQuestionOrder(
      await db
        .select({ id: questions.id, type: questions.type })
        .from(questions)
        .where(eq(questions.examId, session.examId))
        .orderBy(questions.sortOrder, questions.id),
      session.questionOrder
    );
    const myIndex =
      session.mode === "STUDENT" ? me.currentQuestionIndex : session.currentQuestionIndex;
    const current = sessionQuestions[myIndex];
    if (!current || current.id !== questionId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "That question is not open" },
        { status: 409 }
      );
    }

    const timeTakenMs = Math.max(0, Math.round(elapsedMs));
    let isCorrect = false;
    let points = 0;
    let selectedOptions: string[] = [];
    let textAnswer: string | null = null;

    if (current.type === "QUIZ") {
      selectedOptions = Array.isArray(body.selectedOptions)
        ? body.selectedOptions.map(String)
        : [];
      if (selectedOptions.length === 0) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "selectedOptions are required for QUIZ" },
          { status: 400 }
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
      isCorrect =
        correctIds.size === selectedSet.size && [...correctIds].every((c) => selectedSet.has(c));

      const remainingRatio = Math.max(0, Math.min(1, 1 - elapsedMs / totalMs));
      points = !isCorrect
        ? 0
        : session.mode === "STUDENT"
          ? 1000
          : Math.round(500 + 500 * remainingRatio);
    } else if (current.type === "XPATH") {
      const selector = typeof body.textAnswer === "string" ? body.textAnswer.trim() : "";
      if (!selector) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "textAnswer (your selector) is required for XPATH questions" },
          { status: 400 }
        );
      }
      textAnswer = selector;

      const [config] = await db
        .select({ selectorType: xpathConfigs.selectorType })
        .from(xpathConfigs)
        .where(eq(xpathConfigs.questionId, questionId))
        .limit(1);
      const testCases = await db
        .select({
          targetType: xpathTestCases.targetType,
          targetPayload: xpathTestCases.targetPayload,
          referenceSelector: xpathTestCases.referenceSelector,
          selectorType: xpathTestCases.selectorType,
        })
        .from(xpathTestCases)
        .where(eq(xpathTestCases.questionId, questionId));

      if (testCases.length === 0) {
        // No test cases configured — record the answer ungraded, like TEXT
        isCorrect = false;
        points = 0;
      } else {
        const grade = await gradeXPathQuestion({
          selectorType: (config?.selectorType as SelectorType) ?? "XPATH",
          testCases: testCases.map((tc) => ({
            targetType: tc.targetType as "URL" | "HTML",
            targetPayload: tc.targetPayload,
            referenceSelector: tc.referenceSelector,
            selectorType: tc.selectorType as SelectorType,
          })),
          studentSelector: selector,
        });
        isCorrect = grade.status === "AC";
        const remainingRatio = Math.max(0, Math.min(1, 1 - elapsedMs / totalMs));
        const basePoints =
          session.mode === "STUDENT" ? 1000 : Math.round(500 + 500 * remainingRatio);
        points = Math.round((basePoints * grade.scorePercentage) / 100);
      }
    } else if (current.type === "TEXT") {
      const text = typeof body.textAnswer === "string" ? body.textAnswer : "";
      if (!text.trim()) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "textAnswer is required for TEXT questions" },
          { status: 400 }
        );
      }
      textAnswer = text;
      isCorrect = false;
      points = 0;
    } else {
      textAnswer = typeof body.textAnswer === "string" ? body.textAnswer : "";
      isCorrect = false;
      points = 0;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(liveAnswers).values({
          sessionId: id,
          questionId,
          studentId,
          selectedOptions,
          textAnswer,
          isCorrect,
          points,
          timeTakenMs,
        });
        await tx
          .update(liveParticipants)
          .set({
            ...(points > 0 ? { score: sql`${liveParticipants.score} + ${points}` } : {}),
            totalTimeMs: sql`${liveParticipants.totalTimeMs} + ${timeTakenMs}`,
          })
          .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)));
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "You already answered this question" },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json(
      session.showCorrectAnswer
        ? { status: "SUCCESS", isCorrect, points }
        : { status: "SUCCESS", isCorrect: null, points: null }
    );
  } catch (error) {
    console.error("Live answer error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to submit answer" },
      { status: 500 }
    );
  }
}
