import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { codeConfigs, testCases, questions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
    const { questionId, timeLimit, memoryLimit, testCases: cases } = body;

    if (!questionId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "questionId is required" },
        { status: 400 }
      );
    }

    // Verify the question belongs to the exam (and implicitly the teacher's exam, assuming middleware/auth handled that or we trust the exam ID)
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, questionId));

    if (!question || question.examId !== examId || question.type !== "CODE") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid question" },
        { status: 400 }
      );
    }

    await db.transaction(async (tx) => {
      // Upsert config
      const [existingConfig] = await tx
        .select()
        .from(codeConfigs)
        .where(eq(codeConfigs.questionId, questionId));

      if (existingConfig) {
        await tx
          .update(codeConfigs)
          .set({ timeLimit: timeLimit || 1000, memoryLimit: memoryLimit || 65536 })
          .where(eq(codeConfigs.questionId, questionId));
      } else {
        await tx.insert(codeConfigs).values({
          questionId,
          timeLimit: timeLimit || 1000,
          memoryLimit: memoryLimit || 65536,
        });
      }

      // Handle test cases (replace all for simplicity)
      if (Array.isArray(cases) && cases.length > 0) {
        await tx.delete(testCases).where(eq(testCases.questionId, questionId));
        
        const caseInserts = cases.map((c: any) => ({
          questionId,
          inputData: c.inputData,
          outputData: c.outputData,
          isHidden: !!c.isHidden,
        }));
        
        await tx.insert(testCases).values(caseInserts);
      }
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Coding config error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to save coding configuration" },
      { status: 500 }
    );
  }
}

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

    // Fetch all questions of type "CODE" for this exam
    const codeQuestions = await db
      .select()
      .from(questions)
      .where(and(eq(questions.examId, examId), eq(questions.type, "CODE")));

    const enrichedQuestions = [];
    for (const q of codeQuestions) {
      const [config] = await db
        .select()
        .from(codeConfigs)
        .where(eq(codeConfigs.questionId, q.id));

      const cases = await db
        .select()
        .from(testCases)
        .where(eq(testCases.questionId, q.id));

      enrichedQuestions.push({
        id: q.id,
        title: q.title,
        content: q.content,
        config: config || null,
        testCases: cases,
      });
    }

    return NextResponse.json({ status: "SUCCESS", questions: enrichedQuestions });
  } catch (error) {
    console.error("Fetch coding config questions error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch coding questions" },
      { status: 500 }
    );
  }
}
