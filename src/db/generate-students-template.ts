import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

// Students roster template
const students = [
  { student_id: "SV001", full_name: "Nguyen Van A", email: "nguyen.vana@school.edu.vn" },
  { student_id: "SV002", full_name: "Tran Thi B",   email: "tran.thib@school.edu.vn"  },
];

const wsStudents = xlsx.utils.json_to_sheet(students);
const wbStudents = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wbStudents, wsStudents, "Students Roster");

const dir = path.join(process.cwd(), "public", "templates");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

xlsx.writeFile(wbStudents, path.join(dir, "students_roster_template.xlsx"));
console.log("Students roster template generated.");
