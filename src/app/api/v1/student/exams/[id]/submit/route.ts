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
  xpathTestCases,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { gradeQuizQuestion } from "@/lib/grading/quiz-grader";
import { executeCode } from "@/lib/grading/code-executor";
import { gradeXPathQuestion } from "@/lib/grading/xpath-evaluator";
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
    console.log("Submit route received body:", body);
    const { submission_id, submissionId, answers, focus_loss_count, close_reason } = body;
    const subId = submission_id ?? submissionId;
    if (!subId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "submissionId is required." }, { status: 400 });
    }
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "answers must be an array." }, { status: 400 });
    }

    const [submission] = await db.select().from(examSubmissions).where(eq(examSubmissions.id, subId)).limit(1);

    if (process.env.NODE_ENV !== "development" && (!submission || submission.studentId !== studentId || submission.examId !== examId)) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Submission not found or unauthorized." }, { status: 404 });
    }

    if (submission.submittedAt) {
      return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "This exam has already been submitted." }, { status: 400 });
    }

    const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId));
    const questionMap = new Map(examQuestions.map((q) => [q.id, q]));

    const codeQIds = examQuestions.filter((q) => q.type === "CODE").map((q) => q.id);
    const xpathQIds = examQuestions.filter((q) => q.type === "XPATH").map((q) => q.id);
    const quizQIds = examQuestions.filter((q) => q.type === "QUIZ").map((q) => q.id);

    const [allConfigs, allTestCases, allXpathConfigs, allXpathTestCases, allQuizOptions] = await Promise.all([
      codeQIds.length > 0 ? db.select().from(codeConfigs).where(inArray(codeConfigs.questionId, codeQIds)) : Promise.resolve([]),
      codeQIds.length > 0 ? db.select().from(testCases).where(inArray(testCases.questionId, codeQIds)) : Promise.resolve([]),
      xpathQIds.length > 0 ? db.select().from(xpathConfigs).where(inArray(xpathConfigs.questionId, xpathQIds)) : Promise.resolve([]),
      xpathQIds.length > 0 ? db.select().from(xpathTestCases).where(inArray(xpathTestCases.questionId, xpathQIds)) : Promise.resolve([]),
      quizQIds.length > 0 ? db.select().from(quizOptions).where(inArray(quizOptions.questionId, quizQIds)) : Promise.resolve([]),
    ]);

    const configMap = new Map(allConfigs.map((c) => [c.questionId, c]));
    const testCasesMap = new Map();
    for (const tc of allTestCases) {
      const list = testCasesMap.get(tc.questionId) ?? [];
      list.push(tc);
      testCasesMap.set(tc.questionId, list);
    }
    const xpathConfigMap = new Map(allXpathConfigs.map((c) => [c.questionId, c]));
    const xpathTCMap = new Map();
    for (const tc of allXpathTestCases) {
      const list = xpathTCMap.get(tc.questionId) ?? [];
      list.push(tc);
      xpathTCMap.set(tc.questionId, list);
    }
    const quizOptionsMap = new Map();
    for (const opt of allQuizOptions) {
      const list = quizOptionsMap.get(opt.questionId) ?? [];
      list.push(opt);
      quizOptionsMap.set(opt.questionId, list);
    }

    let totalScore = 0;
    const detailInserts: any[] = [];

    for (const answer of answers) {
      const q = questionMap.get(answer.question_id);
      if (!q) continue;

      if (q.type === "QUIZ") {
        const options = quizOptionsMap.get(q.id) ?? [];
        const correctOptionIds = options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id);
        const result = gradeQuizQuestion({ selectedOptionIds: answer.selected_options || [], correctOptionIds, totalPoints: parseFloat(q.points as string) });
        totalScore += result.score;
        detailInserts.push({ submissionId: subId, questionId: q.id, selectedOptions: answer.selected_options || [], score: result.score.toFixed(2) });
      } else if (q.type === "CODE") {
        const config = configMap.get(q.id);
        const cases = testCasesMap.get(q.id) ?? [];
        let questionScore = 0;
        let overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" = "WA";

        if (cases.length > 0) {
          const executionResult = await executeCode({
            sourceCode: answer.source_code,
            language: answer.language as "python" | "javascript",
            testCases: cases.map((c: any) => ({ id: c.id, input: c.inputData, expectedOutput: c.outputData })),
            timeLimitMs: config?.timeLimit || 2000,
            memoryLimitKb: config?.memoryLimit || 128000,
            teacherCode: config?.teacherCode || undefined,
          });
          questionScore = (executionResult.scorePercentage / 100) * parseFloat(q.points as string);
          overallStatus = executionResult.overallStatus;
        }

        totalScore += questionScore;
        detailInserts.push({ submissionId: subId, questionId: q.id, sourceCode: answer.source_code, language: answer.language, status: overallStatus, score: questionScore.toFixed(2) });
      } else if (q.type === "XPATH") {
        const xConfig = xpathConfigMap.get(q.id);
        const cases = xpathTCMap.get(q.id) ?? [];
        let questionScore = 0;
        let xpathStatus: "AC" | "WA" | "CE" = "WA";

        const studentSelector = answer.student_xpath ?? answer.student_selector ?? "";
        if (studentSelector.trim() && xConfig && cases.length > 0) {
          const xResult = await gradeXPathQuestion({
            selectorType: (xConfig.selectorType as "XPATH" | "CSS") ?? "XPATH",
            testCases: cases.map((c: any) => ({ targetType: c.targetType as "URL" | "HTML", targetPayload: c.targetPayload, referenceSelector: c.referenceSelector })),
            studentSelector: studentSelector.trim(),
          });
          xpathStatus = xResult.status;
          questionScore = (xResult.scorePercentage / 100) * parseFloat(q.points as string);
        }

        totalScore += questionScore;
        detailInserts.push({ submissionId: subId, questionId: q.id, studentXpath: studentSelector, status: xpathStatus, score: questionScore.toFixed(2) });
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(examSubmissions).set({ submittedAt: new Date(), totalScore: totalScore.toFixed(2), focusLossCount: focus_loss_count ?? 0, closeReason: close_reason ?? null }).where(eq(examSubmissions.id, subId));
      if (detailInserts.length > 0) {
        await tx.delete(submissionDetails).where(eq(submissionDetails.submissionId, subId));
        await tx.insert(submissionDetails).values(detailInserts);
      }
    });

    return NextResponse.json({ status: "COMPLETED", submissionId: subId, message: "Your submission has been received and graded successfully.", total_score: totalScore.toFixed(2), submitted_at: new Date().toISOString() }, { status: 200 });
  } catch (error) {
    console.error("Submit exam error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to process submission" }, { status: 500 });
  }
}