import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, exams } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

// GET — the sessions this student has joined, with their score and final rank
export async function GET(request: NextRequest) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const sessions = await db
      .select({
        id: liveSessions.id,
        status: liveSessions.status,
        createdAt: liveSessions.createdAt,
        examTitle: exams.title,
        score: liveParticipants.score,
        rank: sql<number>`(
          SELECT COUNT(*)::int + 1 FROM ${liveParticipants} lp2
          WHERE lp2.session_id = ${liveSessions.id}
            AND lp2.score > ${liveParticipants.score}
        )`,
        participantCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${liveParticipants} lp3
          WHERE lp3.session_id = ${liveSessions.id}
        )`,
      })
      .from(liveParticipants)
      .innerJoin(liveSessions, eq(liveSessions.id, liveParticipants.sessionId))
      .innerJoin(exams, eq(exams.id, liveSessions.examId))
      .where(eq(liveParticipants.studentId, studentId))
      .orderBy(desc(liveSessions.createdAt));

    return NextResponse.json({ status: "SUCCESS", sessions });
  } catch (error) {
    console.error("Student live history error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch live quiz history" },
      { status: 500 }
    );
  }
}
