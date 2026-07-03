import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";

export async function GET(request: NextRequest) {
  const teacherId = request.headers.get("x-user-id");
  if (!teacherId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // ── Questions sheet rows ────────────────────────────────────────────────────
  const rows = [
    // ── QUIZ examples ────────────────────────────────────────────────────────
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
      // CODE-only columns
      language: "",
      // XPATH-only columns
      selector_type: "",
      xpath_target_type: "",
      xpath_target_payload: "",
      reference_selector: "",
      is_hidden: "",
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
      language: "",
      selector_type: "",
      xpath_target_type: "",
      xpath_target_payload: "",
      reference_selector: "",
      is_hidden: "",
    },
    // ── CODE example ─────────────────────────────────────────────────────────
    {
      type: "CODE",
      title: "Sum Function",
      question_text: "Write a function add(a, b) that returns the sum of two integers. Print the result of add(5, 7).",
      points: 20,
      correct_identifier: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      language: "javascript",
      selector_type: "",
      xpath_target_type: "",
      xpath_target_payload: "",
      reference_selector: "",
      is_hidden: "",
    },
    // ── XPATH examples (one row per test case) ────────────────────────────────
    // First test case for the XPATH question — title, question_text, points, selector_type set here
    {
      type: "XPATH",
      title: "Select All Paragraphs",
      question_text: "Write an XPath expression that selects all <p> elements inside the <body>.",
      points: 15,
      correct_identifier: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      language: "",
      selector_type: "XPATH",           // XPATH or CSS
      xpath_target_type: "HTML",        // HTML or URL
      xpath_target_payload: "<html><body><p>Hello</p><p>World</p><div>Skip me</div></body></html>",
      reference_selector: "//body/p",   // teacher's reference XPath/CSS
      is_hidden: "false",               // false = visible sample; true = hidden grading case
    },
    // Second test case for the same XPATH question (repeat title to link them)
    {
      type: "XPATH",
      title: "Select All Paragraphs",   // must match the title above exactly to group under same question
      question_text: "",                // leave blank for extra test cases of the same question
      points: "",                       // leave blank — only first row's points count
      correct_identifier: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      language: "",
      selector_type: "XPATH",
      xpath_target_type: "HTML",
      xpath_target_payload: "<html><body><p>Alpha</p><p>Beta</p><p>Gamma</p></body></html>",
      reference_selector: "//body/p",
      is_hidden: "true",                // hidden: used for grading but not shown to student
    },
    // CSS selector example (separate question)
    {
      type: "XPATH",
      title: "CSS: Select Links",
      question_text: "Write a CSS selector that matches all anchor tags with class 'nav-link'.",
      points: 15,
      correct_identifier: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      language: "",
      selector_type: "CSS",             // CSS mode
      xpath_target_type: "HTML",
      xpath_target_payload: '<html><body><a class="nav-link" href="#">Home</a><a class="nav-link" href="#">About</a><a href="#">Skip</a></body></html>',
      reference_selector: "a.nav-link",
      is_hidden: "false",
    },
  ];

  const ws = xlsx.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 6 },   // type
    { wch: 28 },  // title
    { wch: 60 },  // question_text
    { wch: 8 },   // points
    { wch: 20 },  // correct_identifier
    { wch: 28 },  // option_a
    { wch: 28 },  // option_b
    { wch: 28 },  // option_c
    { wch: 28 },  // option_d
    { wch: 14 },  // language
    { wch: 12 },  // selector_type
    { wch: 12 },  // xpath_target_type
    { wch: 60 },  // xpath_target_payload
    { wch: 40 },  // reference_selector
    { wch: 10 },  // is_hidden
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Questions");

  // ── Instructions sheet ────────────────────────────────────────────────────
  const instructions = [
    ["Column", "Required", "Used by", "Description"],
    ["type", "Yes", "ALL", "QUIZ, CODE, or XPATH (uppercase)."],
    ["title", "No", "ALL", "Short question title (max 150 chars). Auto-generated if blank. For XPATH: rows sharing the same title are grouped as test cases of one question."],
    ["question_text", "Yes (first row)", "ALL", "Full question body shown to students. Leave blank on extra XPATH test-case rows."],
    ["points", "Yes (first row)", "ALL", "Numeric score (e.g. 10, 20). Leave blank on extra XPATH test-case rows."],
    ["correct_identifier", "QUIZ only", "QUIZ", "Letter(s) of correct option(s): A, B, C, D or combined e.g. A,C. Leave blank for CODE/XPATH."],
    ["option_a", "QUIZ only", "QUIZ", "Text for option A."],
    ["option_b", "QUIZ only", "QUIZ", "Text for option B."],
    ["option_c", "QUIZ only", "QUIZ", "Text for option C (optional)."],
    ["option_d", "QUIZ only", "QUIZ", "Text for option D (optional)."],
    ["language", "No", "CODE", "Execution language: javascript or python. Defaults to javascript if blank."],
    ["selector_type", "XPATH only", "XPATH", "XPATH or CSS. Determines how student's answer and reference_selector are evaluated."],
    ["xpath_target_type", "XPATH only", "XPATH", "HTML — inline HTML snippet. URL — public URL to fetch. (URL fetches are sandboxed and timeout after 5 s.)"],
    ["xpath_target_payload", "XPATH only", "XPATH", "For HTML: the full HTML string to evaluate against. For URL: the full public URL."],
    ["reference_selector", "XPATH only", "XPATH", "Teacher's correct XPath expression (e.g. //body/p) or CSS selector (e.g. a.nav-link). Used as expected output."],
    ["is_hidden", "No", "XPATH", "true = hidden grading case (not shown to student). false or blank = visible sample case."],
    [],
    ["XPATH grouping rule", "", "", ""],
    ["• Multiple XPATH rows with the SAME title are merged into ONE question with multiple test cases.", "", "", ""],
    ["• The first row sets title, question_text, points, and selector_type.", "", "", ""],
    ["• Additional rows for the same question need only: title (must match exactly), selector_type, xpath_target_type, xpath_target_payload, reference_selector, is_hidden.", "", "", ""],
    [],
    ["General notes", "", "", ""],
    ["• QUIZ: at least 2 options required, correct_identifier is mandatory.", "", "", ""],
    ["• CODE: leave option_a–d, correct_identifier, and all xpath_* columns blank. Add test cases from the question editor after import.", "", "", ""],
    ["• Do not rename or reorder column headers.", "", "", ""],
  ];
  const wsInfo = xlsx.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 80 }];
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
