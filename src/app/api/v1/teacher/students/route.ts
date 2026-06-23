import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";

// GET /api/v1/teacher/students - List all students
export async function GET(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const students = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isFirstLogin: users.isFirstLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, "STUDENT"))
      .orderBy(users.createdAt);

    return NextResponse.json({ status: "SUCCESS", students });
  } catch (error) {
    console.error("List students error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch students" },
      { status: 500 }
    );
  }
}

// POST /api/v1/teacher/students - Add a single student
export async function POST(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { username, fullName, email } = body;

    if (!username || !fullName || !email) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "username, fullName, and email are required" },
        { status: 400 }
      );
    }

    const tempPassword = generateTemporaryPassword();
    const hashedTempPassword = await hashPassword(tempPassword);

    const [newStudent] = await db
      .insert(users)
      .values({
        username: username.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        passwordHash: hashedTempPassword,
        role: "STUDENT",
        isFirstLogin: true,
      })
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isFirstLogin: users.isFirstLogin,
        createdAt: users.createdAt,
      });

    return NextResponse.json({
      status: "SUCCESS",
      student: newStudent,
      temporaryPassword: tempPassword,
    });
  } catch (error: any) {
    console.error("Add student error:", error);
    // Detect unique constraint violations
    if (error?.cause?.code === "23505") {
      return NextResponse.json(
        { error: "CONFLICT", message: "Username or email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to add student" },
      { status: 500 }
    );
  }
}
