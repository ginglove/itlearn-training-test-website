import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, questions } from "@/db/schema";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    // All submissions (submitted + in-progress) for this student, grouped by exam
    const rows = await db
      .select({
        examId: exams.id,
        examTitle: exams.title,
        examDescription: exams.description,
        totalPossibleScore: sql<string>`(
          SELECT COALESCE(SUM(q.points::numeric), 0)
          FROM questions q WHERE q.exam_id = ${exams.id}
        )`,
        totalTaken: sql<number>`COUNT(${examSubmissions.id})`,
        totalCompleted: sql<number>`COUNT(CASE WHEN ${examSubmissions.submittedAt} IS NOT NULL THEN 1 END)`,
        totalIncomplete: sql<number>`COUNT(CASE WHEN ${examSubmissions.submittedAt} IS NULL THEN 1 END)`,
        totalPass: sql<number>`COUNT(CASE
          WHEN ${examSubmissions.submittedAt} IS NOT NULL
            AND (SELECT COALESCE(SUM(q2.points::numeric),0) FROM questions q2 WHERE q2.exam_id = ${exams.id}) > 0
            AND ${examSubmissions.totalScore}::numeric / (SELECT COALESCE(SUM(q2.points::numeric),1) FROM questions q2 WHERE q2.exam_id = ${exams.id}) >= 0.5
          THEN 1 END)`,
        totalFail: sql<number>`COUNT(CASE
          WHEN ${examSubmissions.submittedAt} IS NOT NULL
            AND (SELECT COALESCE(SUM(q2.points::numeric),0) FROM questions q2 WHERE q2.exam_id = ${exams.id}) > 0
            AND ${examSubmissions.totalScore}::numeric / (SELECT COALESCE(SUM(q2.points::numeric),1) FROM questions q2 WHERE q2.exam_id = ${exams.id}) < 0.5
          THEN 1 END)`,
        lastSubmittedAt: sql<string>`MAX(${examSubmissions.submittedAt})`,
        bestScore: sql<string>`MAX(CASE WHEN ${examSubmissions.submittedAt} IS NOT NULL THEN ${examSubmissions.totalScore}::numeric END)`,
      })
      .from(examSubmissions)
      .innerJoin(exams, eq(examSubmissions.examId, exams.id))
      .where(eq(examSubmissions.studentId, studentId))
      .groupBy(exams.id, exams.title, exams.description)
      .orderBy(sql`MAX(${examSubmissions.submittedAt}) DESC NULLS LAST`);

    return NextResponse.json({ status: "SUCCESS", groups: rows });
  } catch (error) {
    console.error("Exam groups error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
