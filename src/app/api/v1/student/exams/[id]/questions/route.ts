import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, exams } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
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
          .select({ id: quizOptions.id, optionText: quizOptions.optionText }) // EXCLUDE isCorrect!
          .from(quizOptions)
          .where(eq(quizOptions.questionId, q.id));

        enrichedQuestions.push({ ...q, options });
      } else if (q.type === "CODE") {
        const [config] = await db
          .select({ starterCode: codeConfigs.starterCode })
          .from(codeConfigs)
          .where(eq(codeConfigs.questionId, q.id))
          .limit(1);

        const publicCases = await db
          .select({
            id: testCases.id,
            inputData: testCases.inputData,
            outputData: testCases.outputData,
          })
          .from(testCases)
          .where(
            and(
              eq(testCases.questionId, q.id),
              eq(testCases.isHidden, false)
            )
          );

        enrichedQuestions.push({
          ...q,
          publicCases,
          starterCode: config?.starterCode || "",
        });
      }
    }

    // Shuffle if configured
    if (exam.isShuffled) {
      for (let i = enrichedQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [enrichedQuestions[i], enrichedQuestions[j]] = [enrichedQuestions[j], enrichedQuestions[i]];
      }
    }

    return NextResponse.json({ status: "SUCCESS", questions: enrichedQuestions });
  } catch (error) {
    console.error("Fetch questions error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}
