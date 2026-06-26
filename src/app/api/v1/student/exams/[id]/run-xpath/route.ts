import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { xpathConfigs, xpathTestCases, exams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { gradeXPathQuestion } from "@/lib/grading/xpath-evaluator";
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
    const { question_id, student_selector } = body;

    if (!question_id || typeof student_selector !== "string" || !student_selector.trim()) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "question_id and student_selector are required." },
        { status: 400 }
      );
    }

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found." }, { status: 404 });

    const [config] = await db.select().from(xpathConfigs).where(eq(xpathConfigs.questionId, question_id)).limit(1);
    const cases = await db.select().from(xpathTestCases).where(eq(xpathTestCases.questionId, question_id));

    if (!config || cases.length === 0) {
      return NextResponse.json(
        { error: "NOT_CONFIGURED", message: "This question has no XPath/CSS configuration yet." },
        { status: 400 }
      );
    }

    // Only evaluate visible test cases during run (hidden cases graded on submit)
    const visibleCases = cases.filter((c) => !c.isHidden);

    const result = await gradeXPathQuestion({
      selectorType: (config.selectorType as "XPATH" | "CSS") ?? "XPATH",
      testCases: visibleCases.map((c) => ({
        targetType: c.targetType as "URL" | "HTML",
        targetPayload: c.targetPayload,
        referenceSelector: c.referenceSelector,
      })),
      studentSelector: student_selector.trim(),
    });

    return NextResponse.json({ status: "SUCCESS", result, hiddenCount: cases.length - visibleCases.length });
  } catch (error) {
    console.error("Run XPath error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to evaluate selector." }, { status: 500 });
  }
}