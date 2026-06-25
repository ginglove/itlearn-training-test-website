import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, exams, xpathConfigs } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";

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

    // Verify ownership
    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.sortOrder));

    const enrichedQuestions = [];

    for (const q of examQuestions) {
      if (q.type === "QUIZ") {
        const options = await db
          .select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, q.id));

        enrichedQuestions.push({ ...q, options });
      } else if (q.type === "CODE") {
        const [config] = await db
          .select()
          .from(codeConfigs)
          .where(eq(codeConfigs.questionId, q.id))
          .limit(1);

        const cases = await db
          .select()
          .from(testCases)
          .where(eq(testCases.questionId, q.id));

        enrichedQuestions.push({
          ...q,
          config: config || null,
          testCases: cases,
        });
      } else if (q.type === "XPATH") {
        const [config] = await db
          .select()
          .from(xpathConfigs)
          .where(eq(xpathConfigs.questionId, q.id))
          .limit(1);

        enrichedQuestions.push({
          ...q,
          xpathConfig: config || null,
        });
      }
    }

    return NextResponse.json({ status: "SUCCESS", questions: enrichedQuestions });
  } catch (error) {
    console.error("Fetch exam questions error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch questions" },
      { status: 500 }
    );
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
    const { type, title, content, points, sortOrder, options, codeConfig, testCases: cases } = body;

    if (!type || !title || !content || points === undefined) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId))).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    const newQuestion = await db.transaction(async (tx) => {
      // 1. Insert question
      const [q] = await tx
        .insert(questions)
        .values({
          examId,
          type,
          title,
          content,
          points: points.toString(),
          sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0,
        })
        .returning();

      // 2. If QUIZ, insert options
      if (type === "QUIZ" && Array.isArray(options)) {
        if (options.length > 0) {
          const quizOptionValues = options.map((opt: any) => ({
            questionId: q.id,
            optionText: opt.optionText,
            isCorrect: !!opt.isCorrect,
          }));
          await tx.insert(quizOptions).values(quizOptionValues);
        }
      }

      // 3. If CODE, insert config and test cases
      if (type === "CODE") {
        const tLimit = codeConfig?.timeLimit || 2000;
        const mLimit = codeConfig?.memoryLimit || 128000;

        await tx.insert(codeConfigs).values({
          questionId: q.id,
          timeLimit: tLimit,
          memoryLimit: mLimit,
          starterCode: codeConfig?.starterCode || "",
          teacherCode: codeConfig?.teacherCode || "",
        });

        if (Array.isArray(cases) && cases.length > 0) {
          const testCaseValues = cases.map((c: any) => ({
            questionId: q.id,
            inputData: c.inputData,
            outputData: c.outputData,
            isHidden: !!c.isHidden,
          }));
          await tx.insert(testCases).values(testCaseValues);
        }
      }

      return q;
    });

    return NextResponse.json({ status: "SUCCESS", question: newQuestion }, { status: 201 });
  } catch (error) {
    console.error("Create question error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create question" },
      { status: 500 }
    );
  }
}
