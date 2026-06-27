import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { codeConfigs, testCases, exams } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { executeCode } from "@/lib/grading/code-executor";
import { getUserId } from "@/lib/get-user-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const body = await request.json();
    const { question_id, source_code, language } = body;

    if (!question_id || typeof source_code !== "string" || !language) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid payload format." },
        { status: 400 }
      );
    }

    // Verify exam exists
    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    // Fetch code config for the question
    const [config] = await db
      .select()
      .from(codeConfigs)
      .where(eq(codeConfigs.questionId, question_id))
      .limit(1);

    // Fetch only PUBLIC/non-hidden test cases for student run-code testing
    const cases = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.questionId, question_id),
          eq(testCases.isHidden, false)
        )
      );

    if (cases.length === 0) {
      return NextResponse.json(
        { error: "NO_TEST_CASES", message: "No public sample test cases configured for this question." },
        { status: 400 }
      );
    }

    // Execute via Piston API
    const executionResult = await executeCode({
      sourceCode: source_code,
      language: language as "python" | "javascript",
      testCases: cases.map((c) => ({
        id: c.id,
        input: c.inputData,
        expectedOutput: c.outputData,
      })),
      timeLimitMs: config?.timeLimit || 2000,
      wrapperCode: config?.wrapperCode || undefined,
    });

    return NextResponse.json({
      status: "SUCCESS",
      executionResult,
    });
  } catch (error) {
    console.error("Run code API error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to run code execution." },
      { status: 500 }
    );
  }
}
