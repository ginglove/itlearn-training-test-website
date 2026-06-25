import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { xpathConfigs, exams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { evaluateXPathQuestion } from "@/lib/grading/xpath-evaluator";
import { getUserId } from "@/lib/get-user-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id: examId } = await params;
    const body = await request.json();
    const { question_id, student_xpath } = body;

    if (!question_id || typeof student_xpath !== "string" || !student_xpath.trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "question_id and student_xpath are required." },
        { status: 400 }
      );
    }

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found." }, { status: 404 });

    const [config] = await db
      .select()
      .from(xpathConfigs)
      .where(eq(xpathConfigs.questionId, question_id))
      .limit(1);

    if (!config) {
      return NextResponse.json(
        { error: "NOT_CONFIGURED", message: "This question has no XPath configuration yet." },
        { status: 400 }
      );
    }

    const result = await evaluateXPathQuestion({
      targetType: config.targetType as "URL" | "HTML",
      targetPayload: config.targetPayload,
      referenceXpath: config.referenceXpath,
      studentXpath: student_xpath.trim(),
    });

    return NextResponse.json({ status: "SUCCESS", result });
  } catch (error) {
    console.error("Run XPath error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to evaluate XPath." }, { status: 500 });
  }
}
