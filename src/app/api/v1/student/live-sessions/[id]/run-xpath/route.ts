import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, questions, xpathConfigs, xpathTestCases } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { gradeXPathQuestion } from "@/lib/grading/xpath-evaluator";

// POST — test a selector against the visible test cases of an XPATH question
// during a live session. Nothing is recorded; grading against all cases
// (including hidden ones) happens on submit via the answer endpoint.
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
        { error: "VALIDATION_ERROR", message: "No question is open right now" },
        { status: 409 }
      );
    }

    const [me] = await db
      .select({ id: liveParticipants.id })
      .from(liveParticipants)
      .where(and(eq(liveParticipants.sessionId, id), eq(liveParticipants.studentId, studentId)))
      .limit(1);
    if (!me) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Join the session first" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { questionId } = body;
    const studentSelector = typeof body.studentSelector === "string" ? body.studentSelector : "";
    if (!questionId || !studentSelector.trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId and studentSelector are required" },
        { status: 400 }
      );
    }
    if (studentSelector.length > 500) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Selector exceeds maximum length of 500 characters." },
        { status: 400 }
      );
    }

    // The question must belong to the session's exam and be XPATH type
    const [question] = await db
      .select({ id: questions.id, type: questions.type })
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.examId, session.examId)))
      .limit(1);
    if (!question || question.type !== "XPATH") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Not an XPath question in this session" },
        { status: 400 }
      );
    }

    const [config] = await db
      .select({ selectorType: xpathConfigs.selectorType })
      .from(xpathConfigs)
      .where(eq(xpathConfigs.questionId, questionId))
      .limit(1);
    const cases = await db
      .select()
      .from(xpathTestCases)
      .where(eq(xpathTestCases.questionId, questionId));
    const visibleCases = cases.filter((c) => !c.isHidden);
    if (visibleCases.length === 0) {
      return NextResponse.json(
        { error: "NOT_CONFIGURED", message: "This question has no visible test cases to run." },
        { status: 400 }
      );
    }

    const result = await gradeXPathQuestion({
      selectorType: (config?.selectorType as "XPATH" | "CSS") ?? "XPATH",
      testCases: visibleCases.map((c) => ({
        targetType: c.targetType as "URL" | "HTML",
        targetPayload: c.targetPayload,
        referenceSelector: c.referenceSelector,
        selectorType: (c.selectorType as "XPATH" | "CSS") ?? undefined,
      })),
      studentSelector: studentSelector.trim(),
    });

    return NextResponse.json({
      status: "SUCCESS",
      result,
      hiddenCount: cases.length - visibleCases.length,
    });
  } catch (error) {
    console.error("Live run XPath error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to evaluate selector." },
      { status: 500 }
    );
  }
}
