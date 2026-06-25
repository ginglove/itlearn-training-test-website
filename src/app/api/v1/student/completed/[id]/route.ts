import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  examSubmissions,
  submissionDetails,
  questions,
  quizOptions,
  exams,
} from "@/db/schema";
import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: submissionId } = await params;

    // Verify submission belongs to student and is submitted
    const [submission] = await db
      .select({
        id: examSubmissions.id,
        examId: examSubmissions.examId,
        totalScore: examSubmissions.totalScore,
        startAt: examSubmissions.startAt,
        submittedAt: examSubmissions.submittedAt,
        focusLossCount: examSubmissions.focusLossCount,
        examTitle: exams.title,
        examDescription: exams.description,
        totalPossibleScore: sql<string>`(
          SELECT COALESCE(SUM(q.points), 0)
          FROM questions q
          WHERE q.exam_id = ${exams.id}
        )`,
        elapsedSeconds: sql<number>`
          EXTRACT(EPOCH FROM (${examSubmissions.submittedAt} - ${examSubmissions.startAt}))::int
        `,
      })
      .from(examSubmissions)
      .innerJoin(exams, eq(examSubmissions.examId, exams.id))
      .where(
        and(
          eq(examSubmissions.id, submissionId),
          eq(examSubmissions.studentId, studentId),
          isNotNull(examSubmissions.submittedAt)
        )
      )
      .limit(1);

    if (!submission) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // Fetch per-question details
    const rawDetails = await db
      .select({
        questionId: submissionDetails.questionId,
        questionTitle: questions.title,
        questionType: questions.type,
        questionPoints: questions.points,
        questionContent: questions.content,
        score: submissionDetails.score,
        status: submissionDetails.status,
        language: submissionDetails.language,
        sourceCode: submissionDetails.sourceCode,
        selectedOptions: submissionDetails.selectedOptions,
        studentXpath: submissionDetails.studentXpath,
      })
      .from(submissionDetails)
      .innerJoin(questions, eq(submissionDetails.questionId, questions.id))
      .where(eq(submissionDetails.submissionId, submissionId));

    // For QUIZ questions, resolve selected option texts and correct option texts
    const quizQuestionIds = [
      ...new Set(
        rawDetails
          .filter((d) => d.questionType === "QUIZ")
          .map((d) => d.questionId)
      ),
    ];

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

    // Build lookup: questionId → { optionId → { text, isCorrect } }
    const optionLookup: Record<string, Record<string, { text: string; isCorrect: boolean }>> = {};
    for (const opt of allOptions) {
      if (!optionLookup[opt.questionId]) optionLookup[opt.questionId] = {};
      optionLookup[opt.questionId][opt.id] = { text: opt.optionText, isCorrect: opt.isCorrect };
    }

    // Enrich details
    const details = rawDetails.map((d) => {
      if (d.questionType === "QUIZ") {
        const opts = optionLookup[d.questionId] ?? {};
        const selectedIds: string[] = Array.isArray(d.selectedOptions) ? d.selectedOptions : [];
        const selectedTexts = selectedIds.map((id) => opts[id]?.text ?? null).filter(Boolean);
        const correctTexts = Object.values(opts).filter((o) => o.isCorrect).map((o) => o.text);

        const correctIds = Object.entries(opts).filter(([, v]) => v.isCorrect).map(([k]) => k).sort();
        const selectedSorted = [...selectedIds].sort();
        const isCorrect =
          correctIds.length > 0 && correctIds.join(",") === selectedSorted.join(",");
        const result = isCorrect ? "PASS" : "FAIL";

        // Compute score dynamically so it's always consistent with PASS/FAIL
        const computedScore = (() => {
          if (selectedIds.length === 0) return d.score;
          if (correctIds.length === 0) return "0.00";
          const hasWrong = selectedSorted.some((id) => !correctIds.includes(id));
          if (hasWrong) return "0.00";
          const correctCount = selectedSorted.filter((id) => correctIds.includes(id)).length;
          const pts = parseFloat(d.questionPoints as string) || 0;
          return (pts * (correctCount / correctIds.length)).toFixed(2);
        })();

        return { ...d, score: computedScore, selectedTexts, correctTexts, result };
      } else {
        // CODE or XPATH
        const result =
          d.status === null ? "NOT COMPLETED" : d.status === "AC" ? "PASS" : "FAIL";
        return { ...d, selectedTexts: [], correctTexts: [], result };
      }
    });

    return NextResponse.json({ status: "SUCCESS", submission, details });
  } catch (error) {
    console.error("Fetch submission detail error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch submission details" },
      { status: 500 }
    );
  }
}
