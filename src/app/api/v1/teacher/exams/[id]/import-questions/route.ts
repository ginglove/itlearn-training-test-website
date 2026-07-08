import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizOptions, xpathConfigs, xpathTestCases } from "@/db/schema";
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

    // ── Group XPATH rows by title so multiple rows → one question with multiple test cases ──
    // Other types (QUIZ/CODE) are processed row-by-row.
    // XPATH rows that share the same title are merged into one question.
    type XpathGroup = {
      rowIndex: number;
      title: string;
      question_text: string;
      points: string;
      selector_type: string;
      testCases: Array<{
        targetType: string;
        targetPayload: string;
        referenceSelector: string;
        isHidden: boolean;
      }>;
    };

    const xpathGroups = new Map<string, XpathGroup>();
    const orderedItems: Array<
      | { kind: "ROW"; rowIndex: number; row: any }
      | { kind: "XPATH_GROUP"; key: string }
    > = [];

    // First pass: collect rows and group XPATH by title
    for (const [index, row] of rows.entries()) {
      const type = row.type?.toString().toUpperCase();
      if (type === "XPATH") {
        const title = (row.title || `XPATH Question ${index + 1}`).trim();
        if (!xpathGroups.has(title)) {
          xpathGroups.set(title, {
            rowIndex: index,
            title,
            question_text: String(row.question_text || ""),
            points: row.points?.toString() ?? "",
            selector_type: (row.selector_type?.toString().toUpperCase() || "XPATH"),
            testCases: [],
          });
          orderedItems.push({ kind: "XPATH_GROUP", key: title });
        }
        const group = xpathGroups.get(title)!;
        const payload = row.xpath_target_payload?.toString() || "";
        const refSel = row.reference_selector?.toString() || "";
        const targetType = (row.xpath_target_type?.toString().toUpperCase() || "HTML") as "HTML" | "URL";
        const isHidden = String(row.is_hidden || "").toLowerCase() === "true";

        if (!payload || !refSel) {
          throw new Error(`Validation Error: XPATH row ${index + 2} ("${title}") is missing xpath_target_payload or reference_selector`);
        }
        group.testCases.push({ targetType, targetPayload: payload, referenceSelector: refSel, isHidden });
      } else {
        orderedItems.push({ kind: "ROW", rowIndex: index, row });
      }
    }

    let importCount = 0;

    await db.transaction(async (tx) => {
      let sortOrder = 0;

      for (const item of orderedItems) {

        // ── QUIZ / CODE / TEXT ────────────────────────────────────────────────
        if (item.kind === "ROW") {
          const { rowIndex, row } = item;
          const type = row.type?.toString().toUpperCase() as "QUIZ" | "CODE" | "TEXT";
          const pointsNum = parseFloat(row.points);
          const points = isNaN(pointsNum) ? "0.00" : pointsNum.toFixed(2);
          const content = row.question_text;
          const title = row.title || `Question ${rowIndex + 1}`;

          if (!type || isNaN(pointsNum) || !content) {
            throw new Error(`Validation Error: Missing required fields in row ${rowIndex + 2}`);
          }
          if (type !== "QUIZ" && type !== "CODE" && type !== "TEXT") {
            throw new Error(`Validation Error: Invalid question type '${type}' in row ${rowIndex + 2}`);
          }

          const [newQuestion] = await tx
            .insert(questions)
            .values({ examId, type, title: String(title).substring(0, 150), content: String(content), points, sortOrder })
            .returning();

          if (type === "QUIZ") {
            const correctKey = String(row.correct_identifier || "").toUpperCase();
            if (!correctKey) {
              throw new Error(`Validation Error: Missing correct_identifier for QUIZ in row ${rowIndex + 2}`);
            }
            const options = [
              { text: row.option_a, key: "A" },
              { text: row.option_b, key: "B" },
              { text: row.option_c, key: "C" },
              { text: row.option_d, key: "D" },
            ].filter(o => o.text);
            if (options.length < 2) {
              throw new Error(`Validation Error: At least two options required for QUIZ in row ${rowIndex + 2}`);
            }
            await tx.insert(quizOptions).values(
              options.map(opt => ({
                questionId: newQuestion.id,
                optionText: String(opt.text),
                isCorrect: correctKey.includes(opt.key),
              }))
            );
          }

          sortOrder++;
          importCount++;
          continue;
        }

        // ── XPATH group ───────────────────────────────────────────────────────
        const group = xpathGroups.get(item.key)!;
        const pointsNum = parseFloat(group.points);
        const points = isNaN(pointsNum) ? "0.00" : pointsNum.toFixed(2);

        if (!group.question_text) {
          throw new Error(`Validation Error: XPATH question "${group.title}" is missing question_text on its first row`);
        }
        if (group.testCases.length === 0) {
          throw new Error(`Validation Error: XPATH question "${group.title}" has no test cases`);
        }
        const selectorType = (group.selector_type === "CSS" ? "CSS" : "XPATH") as "XPATH" | "CSS";

        const [newQuestion] = await tx
          .insert(questions)
          .values({
            examId,
            type: "XPATH",
            title: group.title.substring(0, 150),
            content: group.question_text,
            points,
            sortOrder,
          })
          .returning();

        await tx.insert(xpathConfigs).values({ questionId: newQuestion.id, selectorType });

        await tx.insert(xpathTestCases).values(
          group.testCases.map(tc => ({
            questionId: newQuestion.id,
            targetType: tc.targetType,
            selectorType: (tc as any).selectorType ?? selectorType,
            targetPayload: tc.targetPayload,
            referenceSelector: tc.referenceSelector,
            isHidden: tc.isHidden,
          }))
        );

        sortOrder++;
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
