import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";

// GET — exams that can be hosted as a live quiz: created by this teacher
// (admins see all) and containing at least one QUIZ question
export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await db
      .select({
        id: exams.id,
        title: exams.title,
        description: exams.description,
        createdAt: exams.createdAt,
        quizQuestionCount: sql<number>`COUNT(${questions.id})::int`,
      })
      .from(exams)
      .innerJoin(
        questions,
        sql`${questions.examId} = ${exams.id} AND ${questions.type} = 'QUIZ'`
      )
      .where(isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId))
      .groupBy(exams.id)
      .orderBy(desc(exams.createdAt));

    return NextResponse.json({ status: "SUCCESS", exams: rows });
  } catch (error) {
    console.error("List hostable exams error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to list hostable exams" },
      { status: 500 }
    );
  }
}
