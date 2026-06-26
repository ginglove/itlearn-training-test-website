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

    const [bySubId] = await db.select().from(examSubmissions).where(eq(examSubmissions.id, studentId)).limit(1);
    const [activeSubmission] = bySubId
      ? [bySubId]
      : await db.select().from(examSubmissions).where(eq(examSubmissions.studentId, studentId)).limit(1);

    if (!activeSubmission || activeSubmission.examId !== examId) {
      return NextResponse.json({ error: "NOT_FOUND", message: "No active submission found for this student." }, { status: 404 });
    }

    if (activeSubmission.submittedAt) {
      return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "This submission is already finalized." }, { status: 400 });
    }

    const draftDetails = await db.select().from(submissionDetails).where(eq(submissionDetails.submissionId, activeSubmission.id));
    const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId));
    const draftMap = new Map(draftDetails.map((d) => [d.questionId, d]));

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
    for (const tc of allTestCases) { const l = testCasesMap.get(tc.questionId) ?? []; l.push(tc); testCasesMap.set(tc.questionId, l); }
    const xpathConfigMap = new Map(allXpathConfigs.map((c) => [c.questionId, c]));
    const xpathTCMap = new Map();
    for (const tc of allXpathTestCases) { const l = xpathTCMap.get(tc.questionId) ?? []; l.push(tc); xpathTCMap.set(tc.questionId, l); }
    const quizOptionsMap = new Map();
    for (const opt of allQuizOptions) { const l = quizOptionsMap.get(opt.questionId) ?? []; l.push(opt); quizOptionsMap.set(opt.questionId, l); }

    let totalScore = 0;
    const detailInserts: any[] = [];

    for (const q of examQuestions) {
      const draft = draftMap.get(q.id);

      if (q.type === "QUIZ") {
        const options = quizOptionsMap.get(q.id) ?? [];
        const correctOptionIds = options.filter((o: any) => o.isCorrect).map((o: any) => o.id);
        const result = gradeQuizQuestion({ selectedOptionIds: draft?.selectedOptions ?? [], correctOptionIds, totalPoints: parseFloat(q.points as string) });
        totalScore += result.score;
        detailInserts.push({ submissionId: activeSubmission.id, questionId: q.id, selectedOptions: draft?.selectedOptions ?? [], score: result.score.toFixed(2) });
      } else if (q.type === "CODE") {
        const config = configMap.get(q.id);
        const cases = testCasesMap.get(q.id) ?? [];
        let questionScore = 0;
        let overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" = "WA";
        if (draft?.sourceCode && cases.length > 0) {
          const execResult = await executeCode({ sourceCode: draft.sourceCode, language: (draft.language ?? "python") as "python" | "javascript", testCases: cases.map((c: any) => ({ id: c.id, input: c.inputData, expectedOutput: c.outputData })), timeLimitMs: config?.timeLimit ?? 2000, memoryLimitKb: config?.memoryLimit ?? 128000, teacherCode: config?.teacherCode ?? undefined });
          questionScore = (execResult.scorePercentage / 100) * parseFloat(q.points as string);
          overallStatus = execResult.overallStatus;
        }
        totalScore += questionScore;
        detailInserts.push({ submissionId: activeSubmission.id, questionId: q.id, sourceCode: draft?.sourceCode ?? "", language: draft?.language ?? "python", status: overallStatus, score: questionScore.toFixed(2) });
      } else if (q.type === "XPATH") {
        const xConfig = xpathConfigMap.get(q.id);
        const cases = xpathTCMap.get(q.id) ?? [];
        let questionScore = 0;
        let xpathStatus: "AC" | "WA" | "CE" = "WA";
        const studentSelector = draft?.studentXpath ?? "";
        if (studentSelector && xConfig && cases.length > 0) {
          const xResult = await gradeXPathQuestion({ selectorType: (xConfig.selectorType as "XPATH" | "CSS") ?? "XPATH", testCases: cases.map((c: any) => ({ targetType: c.targetType as "URL" | "HTML", targetPayload: c.targetPayload, referenceSelector: c.referenceSelector })), studentSelector });
          xpathStatus = xResult.status;
          questionScore = (xResult.scorePercentage / 100) * parseFloat(q.points as string);
        }
        totalScore += questionScore;
        detailInserts.push({ submissionId: activeSubmission.id, questionId: q.id, studentXpath: studentSelector, status: xpathStatus, score: questionScore.toFixed(2) });
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(examSubmissions).set({ submittedAt: new Date(), totalScore: totalScore.toFixed(2) }).where(eq(examSubmissions.id, activeSubmission.id));
      if (detailInserts.length > 0) {
        await tx.delete(submissionDetails).where(eq(submissionDetails.submissionId, activeSubmission.id));
        await tx.insert(submissionDetails).values(detailInserts);
      }
    });

    return NextResponse.json({ status: "SUCCESS", message: "Student exam has been force-submitted and graded.", totalScore: totalScore.toFixed(2) });
  } catch (error) {
    console.error("Force-submit error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}