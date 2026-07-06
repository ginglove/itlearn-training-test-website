import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  exams,
  questions,
  quizOptions,
  codeConfigs,
  testCases,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: sourceExamId } = await params;

    // Fetch the source exam (must be owned by this teacher)
    const [source] = await db
      .select()
      .from(exams)
      .where(eq(exams.id, sourceExamId))
      .limit(1);

    if (!source || (source.createdBy !== teacherId && !isAdminRequest(request))) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Exam not found" },
        { status: 404 }
      );
    }

    // Fetch all questions for the source exam
    const sourceQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, sourceExamId))
      .orderBy(asc(questions.sortOrder));

    const clonedExam = await db.transaction(async (tx) => {
      // 1. Clone exam record — shift dates forward by 7 days, mark title as copy
      const startOffset = source.startTime.getTime() - Date.now();
      const cloneStart = new Date(Date.now() + Math.max(startOffset, 24 * 60 * 60 * 1000));
      const cloneEnd = new Date(cloneStart.getTime() + (source.endTime.getTime() - source.startTime.getTime()));

      const [newExam] = await tx
        .insert(exams)
        .values({
          title: `${source.title} (Copy)`,
          description: source.description,
          duration: source.duration,
          startTime: cloneStart,
          endTime: cloneEnd,
          isShuffled: source.isShuffled,
          allowedAttempts: source.allowedAttempts,
          accessType: source.accessType,
          createdBy: teacherId,
        })
        .returning();

      // 2. Clone each question with its options / config / test cases
      for (const q of sourceQuestions) {
        const [newQ] = await tx
          .insert(questions)
          .values({
            examId: newExam.id,
            type: q.type,
            title: q.title,
            content: q.content,
            points: q.points,
            sortOrder: q.sortOrder,
          })
          .returning();

        if (q.type === "QUIZ") {
          const opts = await tx
            .select()
            .from(quizOptions)
            .where(eq(quizOptions.questionId, q.id));

          if (opts.length > 0) {
            await tx.insert(quizOptions).values(
              opts.map((o) => ({
                questionId: newQ.id,
                optionText: o.optionText,
                isCorrect: o.isCorrect,
              }))
            );
          }
        } else if (q.type === "CODE") {
          const [cfg] = await tx
            .select()
            .from(codeConfigs)
            .where(eq(codeConfigs.questionId, q.id))
            .limit(1);

          if (cfg) {
            await tx.insert(codeConfigs).values({
              questionId: newQ.id,
              timeLimit: cfg.timeLimit,
              starterCode: cfg.starterCode,
              teacherCode: cfg.teacherCode,
            });
          }

          const cases = await tx
            .select()
            .from(testCases)
            .where(eq(testCases.questionId, q.id));

          if (cases.length > 0) {
            await tx.insert(testCases).values(
              cases.map((c) => ({
                questionId: newQ.id,
                inputData: c.inputData,
                outputData: c.outputData,
                isHidden: c.isHidden,
              }))
            );
          }
        }
      }

      return newExam;
    });

    return NextResponse.json(
      { status: "SUCCESS", exam: clonedExam },
      { status: 201 }
    );
  } catch (error) {
    console.error("Clone exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to clone exam" },
      { status: 500 }
    );
  }
}
