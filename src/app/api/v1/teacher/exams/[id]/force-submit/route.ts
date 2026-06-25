import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  examSubmissions,
  submissionDetails,
  questions,
  quizOptions,
  codeConfigs,
  testCases,
  xpathConfigs,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { gradeQuizQuestion } from "@/lib/grading/quiz-grader";
import { executeCode } from "@/lib/grading/code-executor";
import { evaluateXPathQuestion } from "@/lib/grading/xpath-evaluator";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id: examId } = await params;
    const body = await request.json();
    const { studentId } = body;
    if (!studentId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "studentId is required." }, { status: 400 });
    }

    // Find the active submission
    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, studentId)) // try by submission id first
      .limit(1);

    // Support looking up by studentId directly
    const [activeSubmission] = submission
      ? [submission]
      : await db
          .select()
          .from(examSubmissions)
          .where(eq(examSubmissions.studentId, studentId))
          .limit(1);

    if (!activeSubmission || activeSubmission.examId !== examId) {
      return NextResponse.json({ error: "NOT_FOUND", message: "No active submission found for this student." }, { status: 404 });
    }

    if (activeSubmission.submittedAt) {
      return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "This submission is already finalized." }, { status: 400 });
    }

    // Fetch current draft details
    const draftDetails = await db
      .select()
      .from(submissionDetails)
      .where(eq(submissionDetails.submissionId, activeSubmission.id));

    const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId));
    const questionMap = new Map(examQuestions.map((q) => [q.id, q]));
    const draftMap = new Map(draftDetails.map((d) => [d.questionId, d]));

    const codeQIds = examQuestions.filter((q) => q.type === "CODE").map((q) => q.id);
    const xpathQIds = examQuestions.filter((q) => q.type === "XPATH").map((q) => q.id);
    const quizQIds = examQuestions.filter((q) => q.type === "QUIZ").map((q) => q.id);

    const [allConfigs, allTestCases, allXpathConfigs, allQuizOptions] = await Promise.all([
      codeQIds.length > 0 ? db.select().from(codeConfigs).where(inArray(codeConfigs.questionId, codeQIds)) : [],
      codeQIds.length > 0 ? db.select().from(testCases).where(inArray(testCases.questionId, codeQIds)) : [],
      xpathQIds.length > 0 ? db.select().from(xpathConfigs).where(inArray(xpathConfigs.questionId, xpathQIds)) : [],
      quizQIds.length > 0 ? db.select().from(quizOptions).where(inArray(quizOptions.questionId, quizQIds)) : [],
    ]);

    const configMap = new Map(allConfigs.map((c) => [c.questionId, c]));
    const xpathConfigMap = new Map(allXpathConfigs.map((c) => [c.questionId, c]));
    const testCasesMap = new Map<string, typeof testCases.$inferSelect[]>();
    for (const tc of allTestCases) {
      const list = testCasesMap.get(tc.questionId) ?? [];
      list.push(tc);
      testCasesMap.set(tc.questionId, list);
    }
    const quizOptionsMap = new Map<string, typeof quizOptions.$inferSelect[]>();
    for (const opt of allQuizOptions) {
      const list = quizOptionsMap.get(opt.questionId) ?? [];
      list.push(opt);
      quizOptionsMap.set(opt.questionId, list);
    }

    let totalScore = 0;
    const detailInserts: any[] = [];

    for (const q of examQuestions) {
      const draft = draftMap.get(q.id);

      if (q.type === "QUIZ") {
        const options = quizOptionsMap.get(q.id) ?? [];
        const correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
        const selectedOptionIds = draft?.selectedOptions ?? [];
        const result = gradeQuizQuestion({
          selectedOptionIds,
          correctOptionIds,
          totalPoints: parseFloat(q.points as string),
        });
        totalScore += result.score;
        detailInserts.push({
          submissionId: activeSubmission.id,
          questionId: q.id,
          selectedOptions: selectedOptionIds,
          score: result.score.toFixed(2),
        });
      } else if (q.type === "CODE") {
        const config = configMap.get(q.id);
        const cases = testCasesMap.get(q.id) ?? [];
        let questionScore = 0;
        let overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" = "WA";

        if (draft?.sourceCode && cases.length > 0) {
          const execResult = await executeCode({
            sourceCode: draft.sourceCode,
            language: (draft.language ?? "python") as "python" | "javascript",
            testCases: cases.map((c) => ({ id: c.id, input: c.inputData, expectedOutput: c.outputData })),
            timeLimitMs: config?.timeLimit ?? 2000,
            memoryLimitKb: config?.memoryLimit ?? 128000,
            teacherCode: config?.teacherCode ?? undefined,
          });
          questionScore = (execResult.scorePercentage / 100) * parseFloat(q.points as string);
          overallStatus = execResult.overallStatus;
        }

        totalScore += questionScore;
        detailInserts.push({
          submissionId: activeSubmission.id,
          questionId: q.id,
          sourceCode: draft?.sourceCode ?? "",
          language: draft?.language ?? "python",
          status: overallStatus,
          score: questionScore.toFixed(2),
        });
      } else if (q.type === "XPATH") {
        const xConfig = xpathConfigMap.get(q.id);
        let questionScore = 0;
        let xpathStatus: "AC" | "WA" | "CE" = "WA";

        if (draft?.studentXpath && xConfig) {
          const xResult = await evaluateXPathQuestion({
            targetType: xConfig.targetType as "URL" | "HTML",
            targetPayload: xConfig.targetPayload,
            referenceXpath: xConfig.referenceXpath,
            studentXpath: draft.studentXpath,
          });
          xpathStatus = xResult.status;
          if (xResult.status === "AC") {
            questionScore = parseFloat(q.points as string);
          }
        }

        totalScore += questionScore;
        detailInserts.push({
          submissionId: activeSubmission.id,
          questionId: q.id,
          studentXpath: draft?.studentXpath ?? "",
          status: xpathStatus,
          score: questionScore.toFixed(2),
        });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(examSubmissions)
        .set({ submittedAt: new Date(), totalScore: totalScore.toFixed(2) })
        .where(eq(examSubmissions.id, activeSubmission.id));

      if (detailInserts.length > 0) {
        await tx.delete(submissionDetails).where(eq(submissionDetails.submissionId, activeSubmission.id));
        await tx.insert(submissionDetails).values(detailInserts);
      }
    });

    return NextResponse.json({
      status: "SUCCESS",
      message: "Student's exam has been force-submitted and graded.",
      totalScore: totalScore.toFixed(2),
    });
  } catch (error) {
    console.error("Force-submit error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
