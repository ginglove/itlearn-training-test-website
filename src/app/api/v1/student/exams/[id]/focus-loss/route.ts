import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// POST /api/v1/student/exams/:id/focus-loss — server-synced focus loss counter
// (RSD_improvement_technical §1): prevents reload-based reset of the
// WARN_AND_LOCK 3-offense threshold by persisting each offense immediately.
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
    const { submissionId } = body;
    if (!submissionId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "submissionId required" },
        { status: 400 }
      );
    }

    const [submission] = await db
      .select({
        id: examSubmissions.id,
        studentId: examSubmissions.studentId,
        examId: examSubmissions.examId,
        submittedAt: examSubmissions.submittedAt,
      })
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionId))
      .limit(1);

    if (!submission || submission.studentId !== studentId || submission.examId !== examId) {
      return NextResponse.json(
        { error: "SUBMISSION_NOT_FOUND", message: "No active submission found" },
        { status: 404 }
      );
    }
    if (submission.submittedAt) {
      return NextResponse.json(
        { error: "ALREADY_SUBMITTED", message: "Submission already finalized" },
        { status: 409 }
      );
    }

    const [updated] = await db
      .update(examSubmissions)
      .set({ focusLossCount: sql`${examSubmissions.focusLossCount} + 1` })
      .where(eq(examSubmissions.id, submissionId))
      .returning({ focusLossCount: examSubmissions.focusLossCount });

    return NextResponse.json({ status: "SUCCESS", focusLossCount: updated.focusLossCount });
  } catch (error) {
    console.error("Focus loss increment error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to record focus loss" },
      { status: 500 }
    );
  }
}
