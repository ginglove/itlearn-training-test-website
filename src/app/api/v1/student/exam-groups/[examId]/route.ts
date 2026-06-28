import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, questions } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { examId } = await params;

    const submissions = await db
      .select({
        id: examSubmissions.id,
        startAt: examSubmissions.startAt,
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
      })
      .from(examSubmissions)
      .innerJoin(exams, eq(examSubmissions.examId, exams.id))
      .where(
        and(
          eq(examSubmissions.studentId, studentId),
          eq(examSubmissions.examId, examId)
        )
      )
      .orderBy(asc(examSubmissions.startAt));

    return NextResponse.json({ status: "SUCCESS", submissions });
  } catch (error) {
    console.error("Exam group detail error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
