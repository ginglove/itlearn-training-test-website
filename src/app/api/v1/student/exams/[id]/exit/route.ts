import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions } from "@/db/schema";
import { eq } from "drizzle-orm";

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
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "submissionId required" },
        { status: 400 }
      );
    }

    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionId))
      .limit(1);

    if (!submission || submission.studentId !== studentId || submission.examId !== examId) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Draft not found or unauthorized" },
        { status: 404 }
      );
    }

    if (submission.submittedAt) {
      return NextResponse.json(
        { error: "ALREADY_SUBMITTED", message: "Cannot exit a submitted exam" },
        { status: 400 }
      );
    }

    // Save active time spent and mark as paused (SAVE_AND_EXIT)
    const savedSeconds = typeof activeSeconds === "number" && activeSeconds >= 0
      ? activeSeconds
      : (submission.activeSeconds ?? 0);

    await db
      .update(examSubmissions)
      .set({ closeReason: "SAVE_AND_EXIT", activeSeconds: savedSeconds })
      .where(eq(examSubmissions.id, submissionId));

    return NextResponse.json(
      { status: "SAVED", message: "Progress saved. You can resume this exam before it closes." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Exit exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to exit exam" },
      { status: 500 }
    );
  }
}
