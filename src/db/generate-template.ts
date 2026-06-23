import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

const data = [
  {
    type: "QUIZ",
    title: "Python Operators",
    question_text: "What is the output of print(2 ** 3) in Python?",
    points: 10,
    correct_identifier: "C",
    option_a: "5",
    option_b: "6",
    option_c: "8",
    option_d: "9"
  },
  {
    type: "CODE",
    title: "Write Sum Function",
    question_text: "Write a function add(a, b) that returns the sum of two numbers. Print the result of add(5, 7).",
    points: 20,
    correct_identifier: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: ""
  }
];

const worksheet = xlsx.utils.json_to_sheet(data);
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, "Questions Template");

// Ensure the target directory exists
const dir = path.join(process.cwd(), "public", "templates");
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const filePath = path.join(dir, "questions_template.xlsx");
xlsx.writeFile(workbook, filePath);
console.log("Template generated successfully at:", filePath);
