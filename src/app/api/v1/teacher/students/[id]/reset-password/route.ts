import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";

// POST /api/v1/teacher/students/[id]/reset-password - Reset a student's password
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: studentId } = await params;

    // Check if the student exists and is indeed a STUDENT role account
    const [student] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users)
      .where(and(eq(users.id, studentId), eq(users.role, "STUDENT")))
      .limit(1);

    if (!student) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Student not found" },
        { status: 404 }
      );
    }

    // Generate new temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedTempPassword = await hashPassword(tempPassword);

    // Update student credentials and set isFirstLogin = true (forcing reset on next login)
    await db
      .update(users)
      .set({
        passwordHash: hashedTempPassword,
        isFirstLogin: true,
      })
      .where(eq(users.id, studentId));

    return NextResponse.json({
      status: "SUCCESS",
      student: {
        id: student.id,
        username: student.username,
        fullName: student.fullName,
        email: student.email,
      },
      temporaryPassword: tempPassword,
    });
  } catch (error) {
    console.error("Reset student password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to reset student password" },
      { status: 500 }
    );
  }
}
