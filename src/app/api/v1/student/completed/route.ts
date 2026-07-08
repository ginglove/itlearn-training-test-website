import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, submissionDetails, questions } from "@/db/schema";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const completed = await db
      .select({
        id: examSubmissions.id,
        examId: exams.id,
        title: exams.title,
        description: exams.description,
        duration: exams.duration,
        submittedAt: examSubmissions.submittedAt,
        totalScore: examSubmissions.totalScore,
        focusLossCount: examSubmissions.focusLossCount,
        elapsedSeconds: sql<number>`
          EXTRACT(EPOCH FROM (${examSubmissions.submittedAt} - ${examSubmissions.startAt}))::int
        `,
        totalPossibleScore: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id}
        )`,
        quizScore: sql<string>`(
          SELECT COALESCE(SUM(sd.score::numeric), 0)
          FROM submission_details sd JOIN questions q ON sd.question_id = q.id
          WHERE sd.submission_id = ${examSubmissions.id} AND q.type = 'QUIZ'
        )`,
        quizTotal: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id} AND q.type = 'QUIZ'
        )`,
        codeScore: sql<string>`(
          SELECT COALESCE(SUM(sd.score::numeric), 0)
          FROM submission_details sd JOIN questions q ON sd.question_id = q.id
          WHERE sd.submission_id = ${examSubmissions.id} AND q.type = 'CODE'
        )`,
        codeTotal: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id} AND q.type = 'CODE'
        )`,
        xpathScore: sql<string>`(
          SELECT COALESCE(SUM(sd.score::numeric), 0)
          FROM submission_details sd JOIN questions q ON sd.question_id = q.id
          WHERE sd.submission_id = ${examSubmissions.id} AND q.type = 'XPATH'
        )`,
        xpathTotal: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id} AND q.type = 'XPATH'
        )`,
        textScore: sql<string>`(
          SELECT COALESCE(SUM(sd.score::numeric), 0)
          FROM submission_details sd JOIN questions q ON sd.question_id = q.id
          WHERE sd.submission_id = ${examSubmissions.id} AND q.type = 'TEXT'
        )`,
        textTotal: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id} AND q.type = 'TEXT'
        )`,
        hasUngradedText: sql<boolean>`EXISTS(
          SELECT 1 FROM submission_details sd
          JOIN questions q ON sd.question_id = q.id
          WHERE sd.submission_id = ${examSubmissions.id}
            AND q.type = 'TEXT' AND sd.graded_at IS NULL
        )`,
      })
      .from(examSubmissions)
      .innerJoin(exams, eq(examSubmissions.examId, exams.id))
      .where(
        and(
          eq(examSubmissions.studentId, studentId),
          isNotNull(examSubmissions.submittedAt)
        )
      )
      .orderBy(desc(examSubmissions.submittedAt));

    return NextResponse.json({ status: "SUCCESS", completed });
  } catch (error) {
    console.error("Fetch completed exams error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch completed exams" },
      { status: 500 }
    );
  }
}
