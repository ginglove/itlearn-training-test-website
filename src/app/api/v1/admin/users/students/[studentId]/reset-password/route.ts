import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";
import { getAdminId } from "@/lib/admin";

// POST — issue a new temporary password; student must change it on next login
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { studentId } = await params;

    const [student] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, studentId), eq(users.role, "STUDENT")))
      .limit(1);
    if (!student) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Student not found" }, { status: 404 });
    }

    const temporaryPassword = generateTemporaryPassword();
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(temporaryPassword), isFirstLogin: true })
      .where(eq(users.id, studentId));

    return NextResponse.json({ status: "SUCCESS", temporaryPassword });
  } catch (error) {
    console.error("Admin reset student password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to reset password" },
      { status: 500 }
    );
  }
}
