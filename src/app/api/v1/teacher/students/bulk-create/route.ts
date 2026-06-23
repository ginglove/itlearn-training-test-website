import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import * as xlsx from "xlsx";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

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
    const provisionedStudents: any[] = [];

    await db.transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const studentId = row.student_id?.toString().trim();
        const fullName = row.full_name?.toString().trim();
        const email = row.email?.toString().trim();

        if (!studentId || !fullName || !email) {
          throw new Error(`Validation Error: Missing required fields in row ${index + 2}`);
        }

        const tempPassword = generateTemporaryPassword();
        const hashedTempPassword = await hashPassword(tempPassword);

        await tx.insert(users).values({
          username: studentId,
          fullName: fullName,
          email: email,
          passwordHash: hashedTempPassword,
          role: "STUDENT",
          isFirstLogin: true,
        });

        provisionedStudents.push({
          username: studentId,
          fullName,
          email,
          temporaryPassword: tempPassword, // In a real app, this might be emailed or downloaded by the teacher
        });

        importCount++;
      }
    });

    return NextResponse.json({ 
      status: "SUCCESS", 
      count: importCount,
      credentials: provisionedStudents // Send back so teacher can distribute them
    });
  } catch (error: any) {
    console.error("Import students error:", error);
    return NextResponse.json(
      { error: "IMPORT_FAILED", message: error.message || "Failed to import students" },
      { status: 500 }
    );
  }
}
