import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions } from "@/db/schema";
import * as xlsx from "xlsx";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json<any>(worksheet);

    let importCount = 0;

    // Use a transaction for atomic import (all or nothing)
    await db.transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const type = row.type?.toString().toUpperCase() as "QUIZ" | "CODE";
        const pointsNum = parseFloat(row.points);
        const points = isNaN(pointsNum) ? "0.00" : pointsNum.toFixed(2);
        const content = row.question_text;
        
        // Let title default to a truncated version of content if not provided explicitly, or just "Question X"
        const title = row.title || `Question ${index + 1}`;

        if (!type || isNaN(pointsNum) || !content) {
          throw new Error(`Validation Error: Missing required fields in row ${index + 2}`);
        }

        if (type !== "QUIZ" && type !== "CODE") {
          throw new Error(`Validation Error: Invalid question type '${type}' in row ${index + 2}`);
        }

        const [newQuestion] = await tx
          .insert(questions)
          .values({
            examId,
            type,
            title: String(title).substring(0, 150),
            content: String(content),
            points,
            sortOrder: index,
          })
          .returning();

        if (type === "QUIZ") {
          const correctKey = String(row.correct_identifier || "").toUpperCase();
          
          if (!correctKey) {
             throw new Error(`Validation Error: Missing correct_identifier for QUIZ in row ${index + 2}`);
          }

          const options = [
            { text: row.option_a, key: "A" },
            { text: row.option_b, key: "B" },
            { text: row.option_c, key: "C" },
            { text: row.option_d, key: "D" },
          ].filter(o => o.text); // Only insert provided options

          if (options.length < 2) {
            throw new Error(`Validation Error: At least two options required for QUIZ in row ${index + 2}`);
          }

          const optionValues = options.map(opt => ({
            questionId: newQuestion.id,
            optionText: String(opt.text),
            isCorrect: correctKey.includes(opt.key), // Supports multiple correct answers (e.g., "A,B")
          }));

          await tx.insert(quizOptions).values(optionValues);
        }
        
        importCount++;
      }
    });

    return NextResponse.json({ status: "SUCCESS", count: importCount });
  } catch (error: any) {
    console.error("Import questions error:", error);
    return NextResponse.json(
      { error: "IMPORT_FAILED", message: error.message || "Failed to import questions" },
      { status: 500 }
    );
  }
}
