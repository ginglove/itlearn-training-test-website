import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { codeConfigs, testCases, exams, examSubmissions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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

    // Verify exam exists and student has an active (unsubmitted) submission
    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const [activeSub] = await db
      .select({ id: examSubmissions.id })
      .from(examSubmissions)
      .where(
        and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, studentId),
          isNull(examSubmissions.submittedAt)
        )
      )
      .limit(1);

    if (!activeSub) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Cannot execute code. Exam session is not active or has been submitted." },
        { status: 403 }
      );
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
