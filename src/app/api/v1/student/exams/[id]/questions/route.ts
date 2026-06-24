import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, exams, examSubmissions } from "@/db/schema";
import { eq, asc, and, isNull } from "drizzle-orm";

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

    // Shuffle if configured — persist order so it stays the same on resume
    if (exam.isShuffled) {
      // Look up the active submission for this student
      const [submission] = await db
        .select({ id: examSubmissions.id, questionOrder: examSubmissions.questionOrder })
        .from(examSubmissions)
        .where(
          and(
            eq(examSubmissions.examId, examId),
            eq(examSubmissions.studentId, studentId),
            isNull(examSubmissions.submittedAt)
          )
        )
        .limit(1);

      if (submission?.questionOrder && (submission.questionOrder as string[]).length === enrichedQuestions.length) {
        // Resume: restore the previously saved order
        const orderMap = new Map((submission.questionOrder as string[]).map((id, idx) => [id, idx]));
        enrichedQuestions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      } else {
        // First load: shuffle and persist the order
        for (let i = enrichedQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [enrichedQuestions[i], enrichedQuestions[j]] = [enrichedQuestions[j], enrichedQuestions[i]];
        }
        if (submission) {
          await db
            .update(examSubmissions)
            .set({ questionOrder: enrichedQuestions.map((q) => q.id) })
            .where(eq(examSubmissions.id, submission.id));
        }
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
