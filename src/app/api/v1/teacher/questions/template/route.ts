import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";

export async function GET(request: NextRequest) {
  const teacherId = request.headers.get("x-user-id");
  if (!teacherId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = [
    {
      type: "QUIZ",
      title: "Python Exponentiation",
      question_text: "What is the output of print(2 ** 3) in Python?",
      points: 10,
      correct_identifier: "C",
      option_a: "5",
      option_b: "6",
      option_c: "8",
      option_d: "9",
    },
    {
      type: "QUIZ",
      title: "List Indexing",
      question_text: "What does my_list[-1] return in Python?",
      points: 10,
      correct_identifier: "B",
      option_a: "The first element",
      option_b: "The last element",
      option_c: "An error",
      option_d: "None",
    },
    {
      type: "CODE",
      title: "Sum Function",
      question_text:
        "Write a function add(a, b) that returns the sum of two integers. Print the result of add(5, 7).",
      points: 20,
      correct_identifier: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
    },
  ];

  const ws = xlsx.utils.json_to_sheet(rows);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 6 },   // type
    { wch: 28 },  // title
    { wch: 60 },  // question_text
    { wch: 8 },   // points
    { wch: 20 },  // correct_identifier
    { wch: 30 },  // option_a
    { wch: 30 },  // option_b
    { wch: 30 },  // option_c
    { wch: 30 },  // option_d
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Questions");

  // Instructions sheet
  const instructions = [
    ["Column", "Required", "Description"],
    ["type", "Yes", "QUIZ or CODE (uppercase)"],
    ["title", "No", "Short question title (max 150 chars). Auto-generated if blank."],
    ["question_text", "Yes", "Full question body shown to students."],
    ["points", "Yes", "Numeric score for this question (e.g. 10, 20)."],
    ["correct_identifier", "Yes for QUIZ", "Letter(s) of correct option(s): A, B, C, D or combined e.g. A,C for multi-select. Leave blank for CODE."],
    ["option_a", "Yes for QUIZ", "Text for option A."],
    ["option_b", "Yes for QUIZ", "Text for option B."],
    ["option_c", "No", "Text for option C (optional extra choice)."],
    ["option_d", "No", "Text for option D (optional extra choice)."],
    [],
    ["Notes", "", ""],
    ["• QUIZ rows need at least 2 options and a correct_identifier.", "", ""],
    ["• CODE rows: leave option_a–d and correct_identifier blank.", "", ""],
    ["• After importing CODE questions, open each question to add test cases.", "", ""],
    ["• Do not change column header names.", "", ""],
  ];
  const wsInfo = xlsx.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 70 }];
  xlsx.utils.book_append_sheet(wb, wsInfo, "Instructions");

  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="questions_template.xlsx"',
    },
  });
}
