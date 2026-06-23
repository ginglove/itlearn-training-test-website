import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, questions } from "@/db/schema";
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
        totalPossibleScore: sql<string>`(
          SELECT COALESCE(SUM(q.points), 0)
          FROM questions q
          WHERE q.exam_id = ${exams.id}
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
