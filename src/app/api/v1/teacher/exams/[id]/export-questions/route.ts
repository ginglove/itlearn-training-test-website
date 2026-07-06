import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions, quizOptions } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import * as xlsx from "xlsx";

// GET — export an exam's QUIZ questions as an .xlsx file in the same
// column format accepted by the import endpoints
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
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
      .select()
      .from(questions)
      .where(and(eq(questions.examId, examId), eq(questions.type, "QUIZ")))
      .orderBy(asc(questions.sortOrder));

    const options = quizQuestions.length
      ? await db
          .select()
          .from(quizOptions)
          .where(inArray(quizOptions.questionId, quizQuestions.map((q) => q.id)))
          .orderBy(asc(quizOptions.id))
      : [];
    const optionsByQuestion = new Map<string, typeof options>();
    for (const opt of options) {
      const list = optionsByQuestion.get(opt.questionId) ?? [];
      list.push(opt);
      optionsByQuestion.set(opt.questionId, list);
    }

    const KEYS = ["A", "B", "C", "D"];
    const rows = quizQuestions.map((q) => {
      const opts = (optionsByQuestion.get(q.id) ?? []).slice(0, 4);
      const row: Record<string, string | number> = {
        type: "QUIZ",
        title: q.title,
        question_text: q.content,
        points: Number(q.points),
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        correct_identifier: "",
      };
      const correctKeys: string[] = [];
      opts.forEach((opt, i) => {
        row[`option_${KEYS[i].toLowerCase()}`] = opt.optionText;
        if (opt.isCorrect) correctKeys.push(KEYS[i]);
      });
      row.correct_identifier = correctKeys.join(",");
      return row;
    });

    const worksheet = xlsx.utils.json_to_sheet(rows, {
      header: [
        "type",
        "title",
        "question_text",
        "points",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_identifier",
      ],
    });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Questions");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    const safeTitle = exam.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "quiz";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeTitle} - questions.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export questions error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to export questions" },
      { status: 500 }
    );
  }
}
