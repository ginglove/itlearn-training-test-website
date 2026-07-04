import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, codeConfigs, testCases, xpathConfigs, xpathTestCases, exams, examSubmissions } from "@/db/schema";
import { eq, asc, and, isNull } from "drizzle-orm";
import { checkWorkspaceExamAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

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
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }

    // Rule W1: workspace-linked exams require an ACTIVE workspace membership,
    // regardless of the exam's global access_type
    const workspaceAccess = await checkWorkspaceExamAccess(examId, studentId);
    if (workspaceAccess.workspaceLinked && !workspaceAccess.isMember) {
      return NextResponse.json(
        { error: "STUDENT_NOT_MEMBER", message: "You are not an active member of this exam's workspace" },
        { status: 403 }
      );
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
          .select({ id: quizOptions.id, optionText: quizOptions.optionText })
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
          .select({ id: testCases.id, inputData: testCases.inputData, outputData: testCases.outputData })
          .from(testCases)
          .where(and(eq(testCases.questionId, q.id), eq(testCases.isHidden, false)));

        enrichedQuestions.push({ ...q, publicCases, starterCode: config?.starterCode || "" });
      } else if (q.type === "XPATH") {
        // Join xpath config (selectorType) and first non-hidden test case (targetType + targetPayload)
        const [xConfig] = await db
          .select({ selectorType: xpathConfigs.selectorType })
          .from(xpathConfigs)
          .where(eq(xpathConfigs.questionId, q.id))
          .limit(1);

        // Show the first public (non-hidden) test case as the target preview for the student
        const [xCase] = await db
          .select({
            targetType: xpathTestCases.targetType,
            targetPayload: xpathTestCases.targetPayload,
          })
          .from(xpathTestCases)
          .where(and(eq(xpathTestCases.questionId, q.id), eq(xpathTestCases.isHidden, false)))
          .limit(1);

        enrichedQuestions.push({
          ...q,
          selectorType: xConfig?.selectorType ?? "XPATH",
          targetType: xCase?.targetType ?? null,
          targetPayload: xCase?.targetPayload ?? null,
        });
      } else {
        enrichedQuestions.push({ ...q });
      }
    }

    // Fetch the active submission
    const [activeSubmission] = await db
      .select({ id: examSubmissions.id, questionOrder: examSubmissions.questionOrder, activeSeconds: examSubmissions.activeSeconds, focusLossCount: examSubmissions.focusLossCount })
      .from(examSubmissions)
      .where(
        and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, studentId),
          isNull(examSubmissions.submittedAt)
        )
      )
      .limit(1);

    // Shuffle if configured — persist order so it stays the same on resume
    let shuffleUpdate: string[] | null = null;
    if (exam.isShuffled) {
      if (activeSubmission?.questionOrder && (activeSubmission.questionOrder as string[]).length === enrichedQuestions.length) {
        const orderMap = new Map((activeSubmission.questionOrder as string[]).map((id, idx) => [id, idx]));
        enrichedQuestions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      } else {
        for (let i = enrichedQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [enrichedQuestions[i], enrichedQuestions[j]] = [enrichedQuestions[j], enrichedQuestions[i]];
        }
        if (activeSubmission) shuffleUpdate = enrichedQuestions.map((q) => q.id);
      }
    }

    // #3: Atomically clear closeReason (re-entry atomicity) and persist shuffle order
    // Both writes happen in the same transaction so the monitor never sees PENDING mid-entry
    if (activeSubmission) {
      await db.transaction(async (tx) => {
        const updatePayload: Record<string, any> = { closeReason: null };
        if (shuffleUpdate) updatePayload.questionOrder = shuffleUpdate;
        await tx
          .update(examSubmissions)
          .set(updatePayload)
          .where(eq(examSubmissions.id, activeSubmission.id));
      });
    }

    // #2: Clamp activeSeconds to exam duration ceiling before returning
    const durationCap = (exam.duration ?? 60) * 60;
    const rawActiveSeconds = activeSubmission?.activeSeconds ?? 0;
    const activeSeconds = Math.min(rawActiveSeconds, durationCap);

    return NextResponse.json({
      status: "SUCCESS",
      questions: enrichedQuestions,
      examTitle: exam.title,
      focusLossPolicy: exam.focusLossPolicy ?? "LOG_ONLY",
      activeSeconds,
      // Server-synced counter so a page reload cannot reset the offense count
      focusLossCount: activeSubmission?.focusLossCount ?? 0,
      examDurationMins: exam.duration,
    });
  } catch (error) {
    console.error("Fetch questions error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to fetch questions" }, { status: 500 });
  }
}
