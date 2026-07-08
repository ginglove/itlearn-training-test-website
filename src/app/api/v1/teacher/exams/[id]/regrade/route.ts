import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { isAdminRequest } from "@/lib/get-user-id";
import {
  examSubmissions,
  submissionDetails,
  questions,
  quizOptions,
  codeConfigs,
  testCases,
  xpathConfigs,
  xpathTestCases,
  exams,
} from "@/db/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { gradeQuizQuestion } from "@/lib/grading/quiz-grader";
import { executeCode } from "@/lib/grading/code-executor";
import { gradeXPathQuestion } from "@/lib/grading/xpath-evaluator";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    const role = request.headers.get("x-user-role");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (role !== "TEACHER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const { id: examId } = await params;
    const body = await request.json();
    const { submissionId } = body;
    if (!submissionId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "submissionId is required." }, { status: 400 });
    }

    // Verify exam belongs to teacher
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), (isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId))))
      .limit(1);
    if (!exam) return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found." }, { status: 404 });

    // Verify submission belongs to this exam and is submitted
    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(and(eq(examSubmissions.id, submissionId), eq(examSubmissions.examId, examId)))
      .limit(1);
    if (!submission) return NextResponse.json({ error: "NOT_FOUND", message: "Submission not found." }, { status: 404 });
    if (!submission.submittedAt) return NextResponse.json({ error: "NOT_SUBMITTED", message: "Submission is not yet submitted." }, { status: 400 });

    // Fetch stored answers from submission_details
    const storedDetails = await db
      .select()
      .from(submissionDetails)
      .where(eq(submissionDetails.submissionId, submissionId));

    const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId));

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
    const testCasesMap = new Map<string, any[]>();
    for (const tc of allTestCases) { const l = testCasesMap.get(tc.questionId) ?? []; l.push(tc); testCasesMap.set(tc.questionId, l); }
    const xpathConfigMap = new Map(allXpathConfigs.map((c) => [c.questionId, c]));
    const xpathTCMap = new Map<string, any[]>();
    for (const tc of allXpathTestCases) { const l = xpathTCMap.get(tc.questionId) ?? []; l.push(tc); xpathTCMap.set(tc.questionId, l); }
    const quizOptionsMap = new Map<string, any[]>();
    for (const opt of allQuizOptions) { const l = quizOptionsMap.get(opt.questionId) ?? []; l.push(opt); quizOptionsMap.set(opt.questionId, l); }

    const detailMap = new Map(storedDetails.map((d) => [d.questionId, d]));

    let totalScore = 0;
    const detailInserts: any[] = [];

    for (const q of examQuestions) {
      const draft = detailMap.get(q.id);
      const pts = parseFloat(q.points as string) || 0;

      if (q.type === "QUIZ") {
        const options = quizOptionsMap.get(q.id) ?? [];
        const correctOptionIds = options.filter((o: any) => o.isCorrect).map((o: any) => o.id);
        const result = gradeQuizQuestion({
          selectedOptionIds: (draft?.selectedOptions as string[]) ?? [],
          correctOptionIds,
          totalPoints: pts,
        });
        totalScore += result.score || 0;
        detailInserts.push({
          submissionId,
          questionId: q.id,
          selectedOptions: draft?.selectedOptions ?? [],
          score: result.score.toFixed(2),
        });
      } else if (q.type === "CODE") {
        const config = configMap.get(q.id);
        const cases = testCasesMap.get(q.id) ?? [];
        let questionScore = 0;
        let overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" | "OFE" = "WA";
        if (draft?.sourceCode && cases.length > 0) {
          const execResult = await executeCode({
            sourceCode: draft.sourceCode,
            language: (draft.language ?? "python") as "python" | "javascript",
            testCases: cases.map((c: any) => ({ id: c.id, input: c.inputData, expectedOutput: c.outputData })),
            timeLimitMs: config?.timeLimit ?? 2000,
            teacherCode: config?.teacherCode ?? undefined,
          });
          questionScore = (execResult.scorePercentage / 100) * pts;
          overallStatus = execResult.overallStatus;
        }
        totalScore += questionScore || 0;
        detailInserts.push({
          submissionId,
          questionId: q.id,
          sourceCode: draft?.sourceCode ?? "",
          language: draft?.language ?? "python",
          status: overallStatus,
          score: questionScore.toFixed(2),
        });
      } else if (q.type === "TEXT") {
        const existingScore = parseFloat(draft?.score as string || "0");
        totalScore += existingScore;
        detailInserts.push({
          submissionId,
          questionId: q.id,
          textAnswer: draft?.textAnswer ?? "",
          score: existingScore.toFixed(2),
          gradedBy: draft?.gradedBy ?? null,
          gradedAt: draft?.gradedAt ?? null,
        });
      } else if (q.type === "XPATH") {
        const xConfig = xpathConfigMap.get(q.id);
        const cases = xpathTCMap.get(q.id) ?? [];
        let questionScore = 0;
        let xpathStatus: "AC" | "WA" | "CE" = "WA";
        const studentSelector = draft?.studentXpath ?? "";
        if (studentSelector && xConfig && cases.length > 0) {
          const xResult = await gradeXPathQuestion({
            selectorType: (xConfig.selectorType as "XPATH" | "CSS") ?? "XPATH",
            testCases: cases.map((c: any) => ({
              targetType: c.targetType as "URL" | "HTML",
              targetPayload: c.targetPayload,
              referenceSelector: c.referenceSelector,
              selectorType: (c.selectorType as "XPATH" | "CSS") ?? undefined,
            })),
            studentSelector,
          });
          xpathStatus = xResult.status;
          questionScore = (xResult.scorePercentage / 100) * pts;
        }
        totalScore += questionScore || 0;
        detailInserts.push({
          submissionId,
          questionId: q.id,
          studentXpath: studentSelector,
          status: xpathStatus,
          score: questionScore.toFixed(2),
        });
      }
    }

    const maxPossible = examQuestions.reduce((s, q) => s + (parseFloat(q.points as string) || 0), 0);
    const safeTotalScore = Math.max(0, Math.min(totalScore, maxPossible));

    await db.transaction(async (tx) => {
      await tx
        .update(examSubmissions)
        .set({ totalScore: safeTotalScore.toFixed(2) })
        .where(eq(examSubmissions.id, submissionId));
      if (detailInserts.length > 0) {
        await tx.delete(submissionDetails).where(eq(submissionDetails.submissionId, submissionId));
        await tx.insert(submissionDetails).values(detailInserts);
      }
    });

    return NextResponse.json({
      status: "SUCCESS",
      message: "Submission re-graded successfully.",
      totalScore: safeTotalScore.toFixed(2),
      maxPossible: maxPossible.toFixed(2),
    });
  } catch (error) {
    console.error("Regrade error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
