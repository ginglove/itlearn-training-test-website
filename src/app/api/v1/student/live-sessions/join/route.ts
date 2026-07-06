import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { liveSessions, liveParticipants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

// POST — join a live session by its 6-character code
export async function POST(request: NextRequest) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Enter the 6-character join code" },
        { status: 400 }
      );
    }

    const [session] = await db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.joinCode, code))
      .limit(1);
    if (!session || session.status === "ENDED") {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "No active session with that code" },
        { status: 404 }
      );
    }

    await db
      .insert(liveParticipants)
      .values({ sessionId: session.id, studentId })
      .onConflictDoNothing();

    return NextResponse.json({ status: "SUCCESS", sessionId: session.id });
  } catch (error) {
    console.error("Join live session error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to join session" },
      { status: 500 }
    );
  }
}
