import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, hashPassword, validatePasswordComplexity } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const studentId = request.headers.get("x-user-id");
    if (!studentId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Current and new passwords are required." },
        { status: 400 }
      );
    }

    // Look up student
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Student account not found." },
        { status: 404 }
      );
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "The current password entered is incorrect." },
        { status: 401 }
      );
    }

    // Validate new password complexity
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "PASSWORD_WEAK",
          message: "New password does not meet complexity requirements.",
          details: validation.errors,
        },
        { status: 422 }
      );
    }

    // Hash and update
    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
      })
      .where(eq(users.id, studentId));

    return NextResponse.json({
      status: "SUCCESS",
      message: "Password updated successfully."
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update password." },
      { status: 500 }
    );
  }
}
