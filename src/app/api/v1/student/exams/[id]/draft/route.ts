import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, submissionDetails } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    // Find the active (unsubmitted) attempt for this student + exam
    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(
        and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, studentId),
          isNull(examSubmissions.submittedAt)
        )
      )
      .limit(1);

    if (!submission) {
      return NextResponse.json({ status: "NO_DRAFT", answers: [] });
    }

    const details = await db
      .select({
        questionId: submissionDetails.questionId,
        selectedOptions: submissionDetails.selectedOptions,
        sourceCode: submissionDetails.sourceCode,
        language: submissionDetails.language,
      })
      .from(submissionDetails)
      .where(eq(submissionDetails.submissionId, submission.id));

    return NextResponse.json({ status: "SUCCESS", answers: details });
  } catch (error) {
    console.error("Fetch draft error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch draft" },
      { status: 500 }
    );
  }
}
