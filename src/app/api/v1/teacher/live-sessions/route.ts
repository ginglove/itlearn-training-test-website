import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants, exams, questions, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";

// GET — list live sessions: admins see every session in the system,
// teachers only the sessions they host
export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const sessions = await db
      .select({
        id: liveSessions.id,
        joinCode: liveSessions.joinCode,
        status: liveSessions.status,
        currentQuestionIndex: liveSessions.currentQuestionIndex,
        questionSeconds: liveSessions.questionSeconds,
        createdAt: liveSessions.createdAt,
        examTitle: exams.title,
        hostName: users.fullName,
        hostUsername: users.username,
        participantCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${liveParticipants}
          WHERE ${liveParticipants.sessionId} = ${liveSessions.id}
        )`,
      })
      .from(liveSessions)
      .innerJoin(exams, eq(exams.id, liveSessions.examId))
      .innerJoin(users, eq(users.id, liveSessions.hostId))
      .where(isAdminRequest(request) ? sql`TRUE` : eq(liveSessions.hostId, teacherId))
      .orderBy(desc(liveSessions.createdAt));

    return NextResponse.json({ status: "SUCCESS", sessions, total: sessions.length });
  } catch (error) {
    console.error("List live sessions error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to list live sessions" },
      { status: 500 }
    );
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// POST — start a live quiz session from an exam's QUIZ questions
export async function POST(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { examId, questionSeconds } = body;
    if (!examId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "examId is required" },
        { status: 400 }
      );
    }

    const [exam] = await db
      .select({ id: exams.id, title: exams.title })
      .from(exams)
      .where(
        and(eq(exams.id, examId), isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId))
      )
      .limit(1);
    if (!exam) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }

    const quizQuestions = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.examId, examId), eq(questions.type, "QUIZ")));
    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "The exam has no quiz questions to host live" },
        { status: 400 }
      );
    }

    // Retry a few times in case of a join-code collision
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [session] = await db
          .insert(liveSessions)
          .values({
            examId,
            hostId: teacherId,
            joinCode: generateJoinCode(),
            questionSeconds:
              Number.isInteger(questionSeconds) && questionSeconds >= 10 && questionSeconds <= 300
                ? questionSeconds
                : 30,
          })
          .returning();
        return NextResponse.json(
          { status: "SUCCESS", session, questionCount: quizQuestions.length },
          { status: 201 }
        );
      } catch (err: any) {
        if (attempt === 4) throw err;
      }
    }
    throw new Error("unreachable");
  } catch (error) {
    console.error("Create live session error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create live session" },
      { status: 500 }
    );
  }
}
