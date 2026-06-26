import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, exams, xpathConfigs, xpathTestCases } from "@/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.sortOrder));

    const qIds = examQuestions.map((q) => q.id);
    if (qIds.length === 0) return NextResponse.json({ status: "SUCCESS", questions: [], examTitle: exam.title });

    const [allOptions, allCodeConfigs, allTestCases, allXpathConfigs, allXpathTestCases] = await Promise.all([
      db.select().from(quizOptions).where(inArray(quizOptions.questionId, qIds)),
      db.select().from(codeConfigs).where(inArray(codeConfigs.questionId, qIds)),
      db.select().from(testCases).where(inArray(testCases.questionId, qIds)),
      db.select().from(xpathConfigs).where(inArray(xpathConfigs.questionId, qIds)),
      db.select().from(xpathTestCases).where(inArray(xpathTestCases.questionId, qIds)),
    ]);

    const optionsMap = new Map();
    for (const o of allOptions) {
      const list = optionsMap.get(o.questionId) ?? [];
      list.push(o);
      optionsMap.set(o.questionId, list);
    }
    const codeConfigMap = new Map(allCodeConfigs.map((c) => [c.questionId, c]));
    const testCasesMap = new Map();
    for (const tc of allTestCases) {
      const list = testCasesMap.get(tc.questionId) ?? [];
      list.push(tc);
      testCasesMap.set(tc.questionId, list);
    }
    const xpathConfigMap = new Map(allXpathConfigs.map((c) => [c.questionId, c]));
    const xpathTCMap = new Map();
    for (const tc of allXpathTestCases) {
      const list = xpathTCMap.get(tc.questionId) ?? [];
      list.push(tc);
      xpathTCMap.set(tc.questionId, list);
    }

    const enrichedQuestions = examQuestions.map((q) => {
      if (q.type === "QUIZ") return { ...q, options: optionsMap.get(q.id) ?? [] };
      if (q.type === "CODE") return { ...q, config: codeConfigMap.get(q.id) ?? null, testCases: testCasesMap.get(q.id) ?? [] };
      if (q.type === "XPATH") return { ...q, xpathConfig: { selectorType: xpathConfigMap.get(q.id)?.selectorType ?? "XPATH", testCases: xpathTCMap.get(q.id) ?? [] } };
      return q;
    });

    return NextResponse.json({ status: "SUCCESS", questions: enrichedQuestions, examTitle: exam.title });
  } catch (error) {
    console.error("Fetch exam questions error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to fetch questions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const body = await request.json();
    const { type, title, content, points, sortOrder, options, codeConfig, testCases: cases, xpathConfig } = body;

    if (!type || !title || !content || points === undefined) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Missing required fields" }, { status: 400 });
    }

    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const newQuestion = await db.transaction(async (tx) => {
      const [q] = await tx
        .insert(questions)
        .values({ examId, type, title, content, points: points.toString(), sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0 })
        .returning();

      if (type === "QUIZ" && Array.isArray(options) && options.length > 0) {
        await tx.insert(quizOptions).values(options.map((opt: any) => ({ questionId: q.id, optionText: opt.optionText, isCorrect: !!opt.isCorrect })));
      }

      if (type === "CODE") {
        await tx.insert(codeConfigs).values({ questionId: q.id, timeLimit: codeConfig?.timeLimit || 2000, memoryLimit: codeConfig?.memoryLimit || 128000, starterCode: codeConfig?.starterCode || "", teacherCode: codeConfig?.teacherCode || "" });
        if (Array.isArray(cases) && cases.length > 0) {
          await tx.insert(testCases).values(cases.map((c: any) => ({ questionId: q.id, inputData: c.inputData, outputData: c.outputData, isHidden: !!c.isHidden })));
        }
      }

      if (type === "XPATH" && xpathConfig) {
        await tx.insert(xpathConfigs).values({ questionId: q.id, selectorType: xpathConfig.selectorType ?? "XPATH" });
        if (Array.isArray(xpathConfig.testCases) && xpathConfig.testCases.length > 0) {
          await tx.insert(xpathTestCases).values(xpathConfig.testCases.map((tc: any) => ({ questionId: q.id, targetType: tc.targetType ?? "HTML", targetPayload: tc.targetPayload, referenceSelector: tc.referenceSelector, isHidden: !!tc.isHidden })));
        }
      }

      return q;
    });

    return NextResponse.json({ status: "SUCCESS", question: newQuestion }, { status: 201 });
  } catch (error) {
    console.error("Create question error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to create question" }, { status: 500 });
  }
}