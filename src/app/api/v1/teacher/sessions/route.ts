import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, users, questions } from "@/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date"); // YYYY-MM-DD in local time; we query by UTC day boundaries

    // Parse the requested date; default to today (UTC)
    let dayStart: Date;
    let dayEnd: Date;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dayStart = new Date(`${dateParam}T00:00:00.000Z`);
      dayEnd   = new Date(`${dateParam}T23:59:59.999Z`);
    } else {
      const now = new Date();
      dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    }

    // All exams owned by this teacher that had any submission starting on the selected date
    const rows = await db
      .select({
        examId:      exams.id,
        examTitle:   exams.title,
        startTime:   exams.startTime,
        endTime:     exams.endTime,
        duration:    exams.duration,
        subId:       examSubmissions.id,
        studentId:   examSubmissions.studentId,
        studentName: users.fullName,
        username:    users.username,
        subStartAt:  examSubmissions.startAt,
        submittedAt: examSubmissions.submittedAt,
        totalScore:  examSubmissions.totalScore,
        focusLoss:   examSubmissions.focusLossCount,
        closeReason: examSubmissions.closeReason,
        attempt:     examSubmissions.attempt,
        clientIp:    examSubmissions.clientIp,
      })
      .from(exams)
      .innerJoin(examSubmissions, eq(examSubmissions.examId, exams.id))
      .innerJoin(users, eq(users.id, examSubmissions.studentId))
      .where(
        and(
          eq(exams.createdBy, teacherId),
          gte(examSubmissions.startAt, dayStart),
          lt(examSubmissions.startAt, dayEnd)
        )
      )
      .orderBy(exams.startTime, users.fullName);

    // Aggregate per-exam totals and build per-student list
    const examMap = new Map<string, {
      examId: string; examTitle: string; startTime: Date; endTime: Date; duration: number;
      totalStarted: number; totalCompleted: number; totalPossibleScore: string;
      students: any[];
    }>();

    // Fetch total possible score per exam (sum of question points)
    const examIds = [...new Set(rows.map(r => r.examId))];
    const scoreSums = examIds.length
      ? await db
          .select({ examId: questions.examId, total: sql<string>`sum(${questions.points})` })
          .from(questions)
          .where(sql`${questions.examId} = ANY(${examIds}::uuid[])`)
          .groupBy(questions.examId)
      : [];
    const scoreSumMap = new Map(scoreSums.map(r => [r.examId, r.total ?? "0"]));

    for (const r of rows) {
      if (!examMap.has(r.examId)) {
        examMap.set(r.examId, {
          examId: r.examId,
          examTitle: r.examTitle,
          startTime: r.startTime,
          endTime: r.endTime,
          duration: r.duration,
          totalStarted: 0,
          totalCompleted: 0,
          totalPossibleScore: scoreSumMap.get(r.examId) ?? "0",
          students: [],
        });
      }
      const exam = examMap.get(r.examId)!;
      exam.totalStarted += 1;
      if (r.submittedAt) exam.totalCompleted += 1;

      const pct = r.submittedAt && Number(exam.totalPossibleScore) > 0
        ? (Number(r.totalScore ?? 0) / Number(exam.totalPossibleScore)) * 100
        : null;
      const passMark = 50;

      exam.students.push({
        submissionId: r.subId,
        studentId:    r.studentId,
        studentName:  r.studentName,
        username:     r.username,
        startAt:      r.subStartAt,
        submittedAt:  r.submittedAt,
        totalScore:   r.totalScore,
        totalPossibleScore: exam.totalPossibleScore,
        percentScore: pct !== null ? Math.round(pct * 10) / 10 : null,
        result:       r.submittedAt ? (pct !== null && pct >= passMark ? "PASS" : "FAIL") : "NOT_COMPLETED",
        focusLossCount: r.focusLoss,
        closeReason:  r.closeReason,
        attempt:      r.attempt,
        clientIp:     r.clientIp,
      });
    }

    const sessions = Array.from(examMap.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return NextResponse.json({ status: "SUCCESS", date: dateParam ?? dayStart.toISOString().slice(0, 10), sessions });
  } catch (error) {
    console.error("Sessions monitor error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
