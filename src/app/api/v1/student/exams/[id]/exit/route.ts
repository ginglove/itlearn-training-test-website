import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, exams } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const body = await request.json();
    const { submissionId, activeSeconds } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "submissionId required" }, { status: 400 });
    }

    // #5: activeSeconds is required, must be integer ≥ 0
    if (typeof activeSeconds !== "number" || !Number.isInteger(activeSeconds) || activeSeconds < 0) {
      return NextResponse.json({ error: "INVALID_ACTIVE_SECONDS", message: "activeSeconds must be a non-negative integer" }, { status: 400 });
    }

    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionId))
      .limit(1);

    if (!submission || submission.studentId !== studentId || submission.examId !== examId) {
      return NextResponse.json({ error: "SUBMISSION_NOT_FOUND", message: "No active submission found" }, { status: 404 });
    }

    // #5: ALREADY_SUBMITTED → 409
    if (submission.submittedAt) {
      return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission already finalized" }, { status: 409 });
    }

    // #5: Reject if exam window has closed
    const [exam] = await db.select({ endTime: exams.endTime, duration: exams.duration })
      .from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }
    if (new Date() > exam.endTime) {
      return NextResponse.json({ error: "EXAM_WINDOW_CLOSED", message: "The exam window has closed and no further actions are permitted." }, { status: 403 });
    }

    // #2: Clamp activeSeconds to exam duration ceiling
    const durationCap = (exam.duration ?? 60) * 60;

    // Anti-tamper verification (RSD_improvement_technical §1): reported
    // activeSeconds cannot exceed the stored value plus real elapsed time since
    // the last heartbeat (+5s drift), and cannot go backwards.
    const DRIFT_SECONDS = 5;
    const lastHeartbeat = submission.activeSecondsUpdatedAt ?? submission.startAt;
    const elapsedSinceHeartbeat = Math.max(
      0,
      Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000)
    );
    const maxAllowed = submission.activeSeconds + elapsedSinceHeartbeat + DRIFT_SECONDS;
    const clampedSeconds = Math.min(
      Math.max(activeSeconds, submission.activeSeconds),
      maxAllowed,
      durationCap
    );

    // #5: All side-effects atomically
    await db
      .update(examSubmissions)
      .set({
        closeReason: "SAVE_AND_EXIT",
        activeSeconds: clampedSeconds,
        activeSecondsUpdatedAt: new Date(),
      })
      .where(eq(examSubmissions.id, submissionId));

    return NextResponse.json({
      message: "Draft saved. Exam session paused.",
      closeReason: "SAVE_AND_EXIT",
      activeSeconds: clampedSeconds,
    });
  } catch (error) {
    console.error("Exit exam error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to exit exam" }, { status: 500 });
  }
}
