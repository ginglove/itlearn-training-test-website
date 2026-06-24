import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  examSubmissions,
  users,
  questions,
  quizOptions,
  submissionDetails,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function buildSnapshot(examId: string) {
  // Total possible score and question count for this exam
  const [totalPossibleRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${questions.points}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(questions)
    .where(eq(questions.examId, examId));
  const totalPossibleScore = totalPossibleRow?.total ?? "0";
  const totalQuestions = Number(totalPossibleRow?.count ?? 0);

  // All submissions with elapsed time
  const submissions = await db
    .select({
      id: examSubmissions.id,
      studentId: users.id,
      studentName: users.fullName,
      studentUsername: users.username,
      clientIp: examSubmissions.clientIp,
      focusLossCount: examSubmissions.focusLossCount,
      totalScore: examSubmissions.totalScore,
      startAt: examSubmissions.startAt,
      submittedAt: examSubmissions.submittedAt,
      elapsedSeconds: sql<number>`
        CASE
          WHEN ${examSubmissions.submittedAt} IS NOT NULL
          THEN EXTRACT(EPOCH FROM (${examSubmissions.submittedAt} - ${examSubmissions.startAt}))::int
          ELSE EXTRACT(EPOCH FROM (NOW() - ${examSubmissions.startAt}))::int
        END
      `,
    })
    .from(examSubmissions)
    .innerJoin(users, eq(examSubmissions.studentId, users.id))
    .where(eq(examSubmissions.examId, examId));

  if (submissions.length === 0) {
    return { totalPossibleScore, roster: [] };
  }

  const allSubmissionIds = submissions.map((s) => s.id);

  // Per-question submission details with source code + selected options
  const detailRows = await db
    .select({
      submissionId: submissionDetails.submissionId,
      questionId: submissionDetails.questionId,
      questionTitle: questions.title,
      questionType: questions.type,
      questionPoints: questions.points,
      score: submissionDetails.score,
      status: submissionDetails.status,
      language: submissionDetails.language,
      sourceCode: submissionDetails.sourceCode,
      selectedOptions: submissionDetails.selectedOptions,
    })
    .from(submissionDetails)
    .innerJoin(questions, eq(submissionDetails.questionId, questions.id))
    .where(
      sql`${submissionDetails.submissionId} = ANY(ARRAY[${sql.join(
        allSubmissionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )}])`
    );

  // Collect all unique questionIds that are QUIZ type
  const quizQuestionIds = [
    ...new Set(
      detailRows
        .filter((d) => d.questionType === "QUIZ")
        .map((d) => d.questionId)
    ),
  ];

  // Fetch ALL options for those questions (with correct flag)
  let allOptions: { id: string; questionId: string; optionText: string; isCorrect: boolean }[] = [];
  if (quizQuestionIds.length > 0) {
    allOptions = await db
      .select({
        id: quizOptions.id,
        questionId: quizOptions.questionId,
        optionText: quizOptions.optionText,
        isCorrect: quizOptions.isCorrect,
      })
      .from(quizOptions)
      .where(inArray(quizOptions.questionId, quizQuestionIds));
  }

  // Build option lookup: questionId → { id → {text, isCorrect} }
  const optionLookup: Record<string, Record<string, { text: string; isCorrect: boolean }>> = {};
  for (const opt of allOptions) {
    if (!optionLookup[opt.questionId]) optionLookup[opt.questionId] = {};
    optionLookup[opt.questionId][opt.id] = { text: opt.optionText, isCorrect: opt.isCorrect };
  }

  // Enrich detail rows with resolved option texts
  const enrichedDetails = detailRows.map((d) => {
    if (d.questionType === "QUIZ") {
      const opts = optionLookup[d.questionId] ?? {};
      const selectedIds: string[] = Array.isArray(d.selectedOptions) ? d.selectedOptions : [];
      const selectedTexts = selectedIds.map((id) => opts[id]?.text ?? id).filter(Boolean);
      const correctTexts = Object.values(opts)
        .filter((o) => o.isCorrect)
        .map((o) => o.text);

      // Determine pass/fail for quiz
      const correctIds = Object.entries(opts)
        .filter(([, v]) => v.isCorrect)
        .map(([k]) => k)
        .sort();
      const selectedSorted = [...selectedIds].sort();
      const isCorrect =
        correctIds.length > 0 &&
        correctIds.join(",") === selectedSorted.join(",");

      // Compute quiz score dynamically (same partial-credit formula as grader)
      // so that score is always consistent with PASS/FAIL display
      const computedScore = (() => {
        if (selectedIds.length === 0) return d.score; // unanswered — keep stored value
        if (correctIds.length === 0) return "0.00";
        const hasWrong = selectedSorted.some((id) => !correctIds.includes(id));
        if (hasWrong) return "0.00";
        const correctCount = selectedSorted.filter((id) =>
          correctIds.includes(id)
        ).length;
        const pts = parseFloat(d.questionPoints as string) || 0;
        return (pts * (correctCount / correctIds.length)).toFixed(2);
      })();

      return {
        ...d,
        score: computedScore,
        selectedTexts,
        correctTexts,
        result: isCorrect ? "PASS" : "FAIL",
      };
    } else {
      // CODE question result
      const result =
        d.status === null
          ? "NOT COMPLETED"
          : d.status === "AC"
          ? "PASS"
          : "FAIL";
      return { ...d, selectedTexts: [], correctTexts: [], result };
    }
  });

  // Group details by submissionId
  const detailsBySubmission: Record<string, any[]> = {};
  for (const row of enrichedDetails) {
    if (!detailsBySubmission[row.submissionId]) {
      detailsBySubmission[row.submissionId] = [];
    }
    detailsBySubmission[row.submissionId].push(row);
  }

  const roster = submissions.map((s) => ({
    ...s,
    details: detailsBySubmission[s.id] || [],
  }));

  return { totalPossibleScore, totalQuestions, roster };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacherId = request.headers.get("x-user-id");
  if (!teacherId) return new Response("Unauthorized", { status: 401 });

  const { id: examId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: {"status":"Connected to monitor stream"}\n\n`
        )
      );

      // Send first snapshot immediately
      try {
        const snap = await buildSnapshot(examId);
        controller.enqueue(
          encoder.encode(
            `event: update\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), ...snap })}\n\n`
          )
        );
      } catch (e) { /* ignore */ }

      // Poll every 5s
      const intervalId = setInterval(async () => {
        try {
          const snap = await buildSnapshot(examId);
          controller.enqueue(
            encoder.encode(
              `event: update\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), ...snap })}\n\n`
            )
          );
        } catch (error) {
          console.error("SSE Poll Error:", error);
        }
      }, 5000);

      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
