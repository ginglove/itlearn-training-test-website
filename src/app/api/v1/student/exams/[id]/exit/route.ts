import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, submissionDetails } from "@/db/schema";
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
    const { submissionId } = body;
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

    await db.transaction(async (tx) => {
      await tx
        .delete(submissionDetails)
        .where(eq(submissionDetails.submissionId, submissionId));
      await tx
        .delete(examSubmissions)
        .where(eq(examSubmissions.id, submissionId));
    });

    return NextResponse.json(
      { status: "EXITED", message: "Draft exam has been cancelled." },
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
