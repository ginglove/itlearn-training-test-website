import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { xpathConfigs, xpathTestCases, questions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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

    if (xpathQuestions.length === 0) {
      return NextResponse.json({ status: "SUCCESS", questions: [] });
    }

    const qIds = xpathQuestions.map((q) => q.id);

    const [configs, cases] = await Promise.all([
      db.select().from(xpathConfigs).where(inArray(xpathConfigs.questionId, qIds)),
      db.select().from(xpathTestCases).where(inArray(xpathTestCases.questionId, qIds)),
    ]);

    const configMap = new Map(configs.map((c) => [c.questionId, c]));
    const casesMap = new Map<string, typeof xpathTestCases.$inferSelect[]>();
    for (const tc of cases) {
      const list = casesMap.get(tc.questionId) ?? [];
      list.push(tc);
      casesMap.set(tc.questionId, list);
    }

    const enriched = xpathQuestions.map((q) => ({
      id: q.id,
      title: q.title,
      content: q.content,
      selectorType: configMap.get(q.id)?.selectorType ?? "XPATH",
      testCases: casesMap.get(q.id) ?? [],
      isConfigured: (casesMap.get(q.id)?.length ?? 0) > 0,
    }));

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
    const { questionId, selectorType, testCases: cases } = body;

    if (!questionId || !selectorType || !Array.isArray(cases) || cases.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId, selectorType, and at least one testCase are required." },
        { status: 400 }
      );
    }

    if (!["XPATH", "CSS"].includes(selectorType)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "selectorType must be XPATH or CSS." }, { status: 400 });
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

    for (const tc of cases) {
      if (!tc.targetType || !tc.targetPayload || !tc.referenceSelector) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Each test case needs targetType, targetPayload, and referenceSelector." },
          { status: 400 }
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(xpathConfigs)
        .values({ questionId, selectorType })
        .onConflictDoUpdate({ target: xpathConfigs.questionId, set: { selectorType } });

      await tx.delete(xpathTestCases).where(eq(xpathTestCases.questionId, questionId));
      await tx.insert(xpathTestCases).values(
        cases.map((tc: any) => ({
          questionId,
          targetType: tc.targetType,
          targetPayload: tc.targetPayload,
          referenceSelector: tc.referenceSelector,
          isHidden: !!tc.isHidden,
        }))
      );
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Save xpath config error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
