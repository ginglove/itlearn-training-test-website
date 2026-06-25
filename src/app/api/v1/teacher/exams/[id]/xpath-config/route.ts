import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { xpathConfigs, questions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyReferenceXPath } from "@/lib/grading/xpath-evaluator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id: examId } = await params;

    const xpathQuestions = await db
      .select()
      .from(questions)
      .where(and(eq(questions.examId, examId), eq(questions.type, "XPATH")));

    const enriched = [];
    for (const q of xpathQuestions) {
      const [config] = await db
        .select()
        .from(xpathConfigs)
        .where(eq(xpathConfigs.questionId, q.id));
      enriched.push({ id: q.id, title: q.title, content: q.content, config: config ?? null });
    }

    return NextResponse.json({ status: "SUCCESS", questions: enriched });
  } catch (error) {
    console.error("Fetch xpath config error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id: examId } = await params;
    const body = await request.json();
    const { questionId, targetType, targetPayload, referenceXpath, verify } = body;

    if (!questionId || !targetType || !targetPayload || !referenceXpath) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId, targetType, targetPayload, and referenceXpath are required." },
        { status: 400 }
      );
    }

    if (!["URL", "HTML"].includes(targetType)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "targetType must be URL or HTML." },
        { status: 400 }
      );
    }

    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, questionId));

    if (!question || question.examId !== examId || question.type !== "XPATH") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid XPATH question for this exam." },
        { status: 400 }
      );
    }

    // Run pre-flight verification if requested
    if (verify) {
      const result = await verifyReferenceXPath({ targetType, targetPayload, referenceXpath });
      if (!result.ok) {
        return NextResponse.json(
          { error: "VERIFICATION_FAILED", message: result.message },
          { status: 422 }
        );
      }
    }

    // Upsert config
    const [existing] = await db
      .select()
      .from(xpathConfigs)
      .where(eq(xpathConfigs.questionId, questionId));

    if (existing) {
      await db
        .update(xpathConfigs)
        .set({ targetType, targetPayload, referenceXpath })
        .where(eq(xpathConfigs.questionId, questionId));
    } else {
      await db.insert(xpathConfigs).values({ questionId, targetType, targetPayload, referenceXpath });
    }

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Save xpath config error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
