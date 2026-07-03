import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, exams, xpathConfigs, xpathTestCases } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId, questionId } = await params;

    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const [question] = await db.select().from(questions).where(and(eq(questions.id, questionId), eq(questions.examId, examId))).limit(1);
    if (!question) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Question not found in this exam" }, { status: 404 });
    }

    const body = await request.json();
    const { title, content, points, sortOrder, options, codeConfig, testCases: cases, xpathConfig } = body;

    if (!title || !content || points === undefined) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Missing required fields" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.update(questions).set({ title, content, points: points.toString(), sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0 }).where(eq(questions.id, questionId));

      if (question.type === "QUIZ") {
        await tx.delete(quizOptions).where(eq(quizOptions.questionId, questionId));
        if (Array.isArray(options) && options.length > 0) {
          await tx.insert(quizOptions).values(options.map((opt: any) => ({ questionId, optionText: opt.optionText, isCorrect: !!opt.isCorrect })));
        }
      }

      if (question.type === "CODE") {
        await tx.insert(codeConfigs).values({ questionId, timeLimit: codeConfig?.timeLimit || 2000, memoryLimit: codeConfig?.memoryLimit || 128000, starterCode: codeConfig?.starterCode || "", teacherCode: codeConfig?.teacherCode || "" })
          .onConflictDoUpdate({ target: codeConfigs.questionId, set: { timeLimit: codeConfig?.timeLimit || 2000, memoryLimit: codeConfig?.memoryLimit || 128000, starterCode: codeConfig?.starterCode || "", teacherCode: codeConfig?.teacherCode || "" } });
        await tx.delete(testCases).where(eq(testCases.questionId, questionId));
        if (Array.isArray(cases) && cases.length > 0) {
          await tx.insert(testCases).values(cases.map((c: any) => ({ questionId, inputData: c.inputData, outputData: c.outputData, isHidden: !!c.isHidden })));
        }
      }

      if (question.type === "XPATH" && xpathConfig) {
        await tx.insert(xpathConfigs).values({ questionId, selectorType: xpathConfig.selectorType ?? "XPATH" })
          .onConflictDoUpdate({ target: xpathConfigs.questionId, set: { selectorType: xpathConfig.selectorType ?? "XPATH" } });
        await tx.delete(xpathTestCases).where(eq(xpathTestCases.questionId, questionId));
        if (Array.isArray(xpathConfig.testCases) && xpathConfig.testCases.length > 0) {
          await tx.insert(xpathTestCases).values(xpathConfig.testCases.map((tc: any) => ({ questionId, targetType: tc.targetType ?? "HTML", selectorType: tc.selectorType ?? "XPATH", targetPayload: tc.targetPayload, referenceSelector: tc.referenceSelector, isHidden: !!tc.isHidden })));
        }
      }
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Update question error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to update question" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId, questionId } = await params;

    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const [question] = await db.select().from(questions).where(and(eq(questions.id, questionId), eq(questions.examId, examId))).limit(1);
    if (!question) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Question not found in this exam" }, { status: 404 });
    }

    await db.delete(questions).where(eq(questions.id, questionId));

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Delete question error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to delete question" }, { status: 500 });
  }
}