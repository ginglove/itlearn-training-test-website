import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { examSubmissions, submissionDetails } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = getUserId(request, "student");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const body = await request.json();
    const { submission_id, submissionId, unsynced_payloads } = body;
    const subId = submission_id ?? submissionId;
    if (!subId || !Array.isArray(unsynced_payloads)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid payload format." },
        { status: 400 }
      );
    }
    if (unsynced_payloads.length > 200) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Too many payloads in a single auto-save request." },
        { status: 400 }
      );
    }

    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, subId));

    if (!submission || submission.studentId !== studentId || submission.examId !== examId || submission.submittedAt) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Cannot auto-save. Session invalid or already submitted." },
        { status: 403 }
      );
    }

    await db.transaction(async (tx) => {
      for (const payload of unsynced_payloads) {
        // Upsert draft logic
        const [existingDetail] = await tx
          .select()
          .from(submissionDetails)
          .where(
            and(
              eq(submissionDetails.submissionId, subId),
              eq(submissionDetails.questionId, payload.question_id)
            )
          );

        if (existingDetail) {
          await tx
            .update(submissionDetails)
            .set({
              selectedOptions: payload.selected_options ?? existingDetail.selectedOptions,
              sourceCode: payload.source_code ?? existingDetail.sourceCode,
              language: payload.language ?? existingDetail.language,
              studentXpath: payload.student_xpath ?? existingDetail.studentXpath,
              textAnswer: payload.text_answer ?? existingDetail.textAnswer,
            })
            .where(eq(submissionDetails.id, existingDetail.id));
        } else {
          await tx.insert(submissionDetails).values({
            submissionId: subId,
            questionId: payload.question_id,
            selectedOptions: payload.selected_options ?? [],
            sourceCode: payload.source_code ?? "",
            language: payload.language ?? "python",
            studentXpath: payload.student_xpath ?? null,
            textAnswer: payload.text_answer ?? null,
          });
        }
      }
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Auto-save error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to auto-save" },
      { status: 500 }
    );
  }
}
