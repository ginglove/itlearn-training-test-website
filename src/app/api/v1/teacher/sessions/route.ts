import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examSubmissions, users, questions } from "@/db/schema";
import { eq, and, gte, lt, inArray, sum } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date"); // YYYY-MM-DD
    // tzOffset is the client's UTC offset in minutes (e.g. +420 for UTC+7)
    const tzOffset = parseInt(searchParams.get("tz") ?? "0", 10);

    // Convert the local date to UTC boundaries
    // e.g. date=2026-06-26, tz=420 → start = 2026-06-25T17:00:00Z, end = 2026-06-26T17:00:00Z
    const resolvedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

    const localMidnight = new Date(`${resolvedDate}T00:00:00.000Z`);
    const offsetMs = tzOffset * 60 * 1000;
    // day start in UTC = midnight local time shifted back by tz offset
    const dayStart = new Date(localMidnight.getTime() - offsetMs);
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000); // exactly +24h

    // All exams owned by this teacher with submissions starting on the selected date
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

    if (rows.length === 0) {
      return NextResponse.json({ status: "SUCCESS", date: resolvedDate, sessions: [] });
    }

    // Fetch total possible score per exam using inArray (safe UUID handling)
    const examIds = [...new Set(rows.map(r => r.examId))];
    const scoreSums = await db
      .select({ examId: questions.examId, total: sum(questions.points) })
      .from(questions)
      .where(inArray(questions.examId, examIds))
      .groupBy(questions.examId);
    const scoreSumMap = new Map(scoreSums.map(r => [r.examId, r.total ?? "0"]));

    // Build per-exam aggregated structure
    const examMap = new Map<string, {
      examId: string; examTitle: string; startTime: Date; endTime: Date; duration: number;
      totalStarted: number; totalCompleted: number; totalPending: number; totalCancelled: number;
      totalPossibleScore: string; students: any[];
    }>();

    const PASS_MARK = 50; // percent
    const now = new Date();

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
          totalPending: 0,
          totalCancelled: 0,
          totalPossibleScore: scoreSumMap.get(r.examId) ?? "0",
          students: [],
        });
      }
      const exam = examMap.get(r.examId)!;
      exam.totalStarted += 1;
      if (r.submittedAt) {
        exam.totalCompleted += 1;
      } else if (now > exam.endTime) {
        exam.totalCancelled += 1;
      } else if (r.closeReason === "SAVE_AND_EXIT") {
        exam.totalPending += 1;
      }

      const possibleScore = Number(exam.totalPossibleScore);
      const pct = r.submittedAt && possibleScore > 0
        ? (Number(r.totalScore ?? 0) / possibleScore) * 100
        : null;

      const examClosed = now > exam.endTime;
      let submissionStatus: "SUBMITTED" | "IN_PROGRESS" | "PENDING" | "CANCELLED";
      if (r.submittedAt) {
        submissionStatus = "SUBMITTED";
      } else if (examClosed) {
        submissionStatus = "CANCELLED";
      } else if (r.closeReason === "SAVE_AND_EXIT") {
        submissionStatus = "PENDING";
      } else {
        submissionStatus = "IN_PROGRESS";
      }

      exam.students.push({
        submissionId:       r.subId,
        studentId:          r.studentId,
        studentName:        r.studentName,
        username:           r.username,
        startAt:            r.subStartAt,
        submittedAt:        r.submittedAt,
        totalScore:         r.totalScore,
        totalPossibleScore: exam.totalPossibleScore,
        percentScore:       pct !== null ? Math.round(pct * 10) / 10 : null,
        result:             r.submittedAt
                              ? (pct !== null && pct >= PASS_MARK ? "PASS" : "FAIL")
                              : "NOT_COMPLETED",
        submissionStatus,
        focusLossCount:     r.focusLoss,
        closeReason:        r.closeReason,
        attempt:            r.attempt,
        clientIp:           r.clientIp,
      });
    }

    const sessions = Array.from(examMap.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return NextResponse.json({ status: "SUCCESS", date: resolvedDate, sessions });
  } catch (error) {
    console.error("Sessions monitor error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: String(error) }, { status: 500 });
  }
}
