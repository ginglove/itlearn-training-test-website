import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions, quizOptions } from "@/db/schema";
import { getUserId } from "@/lib/get-user-id";
import * as xlsx from "xlsx";

// POST — import QUIZ questions from an .xlsx file into a new exam so it can
// be hosted as a live quiz right away. Accepts the same columns as the exam
// question import: type, title, question_text, points, option_a..option_d,
// correct_identifier. Non-QUIZ rows are rejected since only QUIZ questions
// can be played live.
export async function POST(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "No file provided" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any>(worksheet);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "The file has no question rows" },
        { status: 400 }
      );
    }

    const titleField = formData.get("title");
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "").trim();
    const examTitle =
      (typeof titleField === "string" && titleField.trim()) || fallbackTitle || "Live Quiz";

    const parsed = rows.map((row, index) => {
      const type = row.type?.toString().toUpperCase() || "QUIZ";
      if (type !== "QUIZ") {
        throw new Error(
          `Validation Error: Row ${index + 2} has type '${type}' — only QUIZ questions can be hosted live`
        );
      }
      const content = row.question_text;
      if (!content) {
        throw new Error(`Validation Error: Missing question_text in row ${index + 2}`);
      }
      const pointsNum = parseFloat(row.points);
      const correctKey = String(row.correct_identifier || "").toUpperCase();
      if (!correctKey) {
        throw new Error(`Validation Error: Missing correct_identifier in row ${index + 2}`);
      }
      const options = [
        { text: row.option_a, key: "A" },
        { text: row.option_b, key: "B" },
        { text: row.option_c, key: "C" },
        { text: row.option_d, key: "D" },
      ].filter((o) => o.text !== undefined && o.text !== null && String(o.text) !== "");
      if (options.length < 2) {
        throw new Error(`Validation Error: At least two options required in row ${index + 2}`);
      }
      if (!options.some((o) => correctKey.includes(o.key))) {
        throw new Error(
          `Validation Error: correct_identifier '${correctKey}' matches no option in row ${index + 2}`
        );
      }
      return {
        title: String(row.title || `Question ${index + 1}`).substring(0, 150),
        content: String(content),
        points: isNaN(pointsNum) ? "1.00" : pointsNum.toFixed(2),
        options: options.map((o) => ({
          optionText: String(o.text),
          isCorrect: correctKey.includes(o.key),
        })),
      };
    });

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      // ASSIGNED with no assignees keeps the imported quiz out of students'
      // regular exam lists — it is only reachable through a live session
      const [exam] = await tx
        .insert(exams)
        .values({
          title: examTitle.substring(0, 150),
          description: "Imported for live quiz",
          duration: Math.max(parsed.length, 5),
          startTime: now,
          endTime: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
          accessType: "ASSIGNED",
          sessionType: "QUIZ",
          createdBy: teacherId,
        })
        .returning();

      for (const [sortOrder, q] of parsed.entries()) {
        const [newQuestion] = await tx
          .insert(questions)
          .values({
            examId: exam.id,
            type: "QUIZ",
            title: q.title,
            content: q.content,
            points: q.points,
            sortOrder,
          })
          .returning();
        await tx.insert(quizOptions).values(
          q.options.map((opt) => ({ questionId: newQuestion.id, ...opt }))
        );
      }
      return exam;
    });

    return NextResponse.json(
      { status: "SUCCESS", exam: result, questionCount: parsed.length },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Live quiz import error:", error);
    const isValidation = String(error?.message || "").startsWith("Validation Error");
    return NextResponse.json(
      {
        error: isValidation ? "VALIDATION_ERROR" : "IMPORT_FAILED",
        message: error?.message || "Failed to import questions",
      },
      { status: isValidation ? 400 : 500 }
    );
  }
}
