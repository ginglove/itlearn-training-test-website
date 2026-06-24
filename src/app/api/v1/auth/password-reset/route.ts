import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, validatePasswordComplexity, verifyToken, generateToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reset_token, new_password } = body;

    if (!reset_token || !new_password) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Reset token and new password are required." },
        { status: 400 }
      );
    }

    // Verify reset token
    const payload = await verifyToken(reset_token);
    if (!payload) {
      return NextResponse.json(
        { error: "INVALID_TOKEN", message: "The reset token is invalid or expired." },
        { status: 401 }
      );
    }

    // Validate password complexity (RSD Section 2.2)
    const validation = validatePasswordComplexity(new_password);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "PASSWORD_WEAK",
          message: "Password does not meet complexity requirements.",
          details: validation.errors,
        },
        { status: 422 }
      );
    }

    // Hash and update
    const newHash = await hashPassword(new_password);

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        isFirstLogin: false,
      })
      .where(eq(users.id, payload.userId));

    // Generate a fresh session token
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const token = await generateToken({
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      boundIp: clientIp,
    });

    // Fetch the updated user to return the same shape as /auth/login
    const [updatedUser] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isFirstLogin: users.isFirstLogin,
      })
      .where(eq(users.id, payload.userId));

    return NextResponse.json({
      status: "SUCCESS",
      token,
      role: payload.role,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        full_name: updatedUser.fullName,
        role: updatedUser.role,
        is_first_login: updatedUser.isFirstLogin,
      },
      message: "Password has been updated successfully.",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
