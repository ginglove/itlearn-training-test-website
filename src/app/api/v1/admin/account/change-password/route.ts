import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, hashPassword, validatePasswordComplexity } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// POST /api/v1/admin/account/change-password — admin changes own password
export async function POST(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Current and new passwords are required." },
        { status: 400 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Admin account not found." }, { status: 404 });
    }

    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "The current password entered is incorrect." },
        { status: 401 }
      );
    }

    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: validation.errors.join(" ") },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), isFirstLogin: false })
      .where(eq(users.id, adminId));

    return NextResponse.json({ status: "SUCCESS", message: "Password updated successfully." });
  } catch (error) {
    console.error("Admin change password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to change password" },
      { status: 500 }
    );
  }
}
