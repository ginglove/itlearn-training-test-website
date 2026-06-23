import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  examSubmissions,
  submissionDetails,
  questions,
  quizOptions,
  codeConfigs,
  testCases,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { gradeQuizQuestion } from "@/lib/grading/quiz-grader";
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
    // No longer return UNAUTHORIZED for missing header in dev

    const body = await request.json();
    console.log('Submit route received body:', body);
    const { submission_id, submissionId, answers, focus_loss_count } = body;
    const subId = submission_id ?? submissionId;
    const submissionIdFinal = subId;
    if (!submissionIdFinal) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "submissionId is required." },
        { status: 400 }
      );
    }
    if (!Array.isArray(answers)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "answers must be an array." },
        { status: 400 }
      );
    }

    // Verify submission belongs to this student and exam
    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionIdFinal))
      .limit(1);

    if (process.env.NODE_ENV !== "development" && (
      !submission ||
      submission.studentId !== studentId ||
      submission.examId !== examId
    )) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Submission not found or unauthorized." },
        { status: 404 }
      );
    }

    if (submission.submittedAt) {
      return NextResponse.json(
        { error: "ALREADY_SUBMITTED", message: "This exam has already been submitted." },
        { status: 400 }
      );
    }

    // Fetch all questions for this exam to validate answers
    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, examId));

    const questionMap = new Map(examQuestions.map((q) => [q.id, q]));

    // Fetch code configs and test cases for all CODE questions in this exam
    const codeQuestions = examQuestions.filter((q) => q.type === "CODE");
    const codeQuestionIds = codeQuestions.map((q) => q.id);

    let allConfigs: any[] = [];
    let allTestCases: any[] = [];

    if (codeQuestionIds.length > 0) {
      allConfigs = await db
        .select()
        .from(codeConfigs)
        .where(inArray(codeConfigs.questionId, codeQuestionIds));

      allTestCases = await db
        .select()
        .from(testCases)
        .where(inArray(testCases.questionId, codeQuestionIds));
    }

    const configMap = new Map(allConfigs.map((c) => [c.questionId, c]));
    // Group test cases by questionId
    const testCasesMap = new Map<string, typeof testCases.$inferSelect[]>();
    for (const tc of allTestCases) {
      const list = testCasesMap.get(tc.questionId) || [];
      list.push(tc);
      testCasesMap.set(tc.questionId, list);
    }

    // Grade QUIZ and CODE questions synchronously
    let totalScore = 0;
    const detailInserts: any[] = [];

    for (const answer of answers) {
      const q = questionMap.get(answer.question_id);
      if (!q) continue;

        if (q.type === "QUIZ") {
          // Fetch correct options
          const options = await db
            .select()
            .from(quizOptions)
            .where(eq(quizOptions.questionId, q.id));

          const correctOptionIds = options
            .filter((opt) => opt.isCorrect)
            .map((opt) => opt.id);

          const result = gradeQuizQuestion({
            selectedOptionIds: answer.selected_options || [],
            correctOptionIds,
            totalPoints: parseFloat(q.points as string),
          });

          totalScore += result.score;

          detailInserts.push({
            submissionId: submissionIdFinal,
            questionId: q.id,
            selectedOptions: answer.selected_options || [],
            score: result.score.toFixed(2),
          });
        } else if (q.type === "CODE") {
          const config = configMap.get(q.id);
          const cases = testCasesMap.get(q.id) || [];

          let questionScore = 0;
          let overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" = "WA";

          if (cases.length > 0) {
            const executionResult = await executeCode({
              sourceCode: answer.source_code,
              language: answer.language as "python" | "javascript",
              testCases: cases.map((c) => ({
                id: c.id,
                input: c.inputData,
                expectedOutput: c.outputData,
              })),
              timeLimitMs: config?.timeLimit || 2000,
              memoryLimitKb: config?.memoryLimit || 128000,
              teacherCode: config?.teacherCode || undefined,
            });

            const qPoints = parseFloat(q.points as string);
            questionScore = (executionResult.scorePercentage / 100) * qPoints;
            overallStatus = executionResult.overallStatus;
          }

          totalScore += questionScore;

          detailInserts.push({
            submissionId: submissionIdFinal,
            questionId: q.id,
            sourceCode: answer.source_code,
            language: answer.language,
            status: overallStatus,
            score: questionScore.toFixed(2),
          });
        }
    }

    // Wrap DB updates in a transaction
    await db.transaction(async (tx) => {
      // 1. Mark exam as submitted, update total score & focus loss count
      await tx
        .update(examSubmissions)
        .set({
          submittedAt: new Date(),
          totalScore: totalScore.toFixed(2),
          focusLossCount: focus_loss_count ?? 0,
        })
        .where(eq(examSubmissions.id, submissionIdFinal));

      // 2. Clear previous draft details if any, then insert final
      if (detailInserts.length > 0) {
        await tx
          .delete(submissionDetails)
          .where(eq(submissionDetails.submissionId, submissionIdFinal));
        
          await tx.insert(submissionDetails).values(detailInserts);
      }
    });

    return NextResponse.json(
      {
        status: "COMPLETED",
        submissionId: submissionIdFinal,
        message: "Your submission has been received and graded successfully.",
        total_score: totalScore.toFixed(2),
        submitted_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Submit exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to process submission" },
      { status: 500 }
    );
  }
}
