import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";
import { getAdminId } from "@/lib/admin";

// POST /api/v1/admin/users/teachers/:teacherId/reset-password
// Issues a new temporary password; the teacher must change it on next login.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { teacherId } = await params;

    const [teacher] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, teacherId), eq(users.role, "TEACHER")))
      .limit(1);
    if (!teacher) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teacher not found" }, { status: 404 });
    }

    const temporaryPassword = generateTemporaryPassword();
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(temporaryPassword), isFirstLogin: true })
      .where(eq(users.id, teacherId));

    return NextResponse.json({ status: "SUCCESS", temporaryPassword });
  } catch (error) {
    console.error("Admin reset teacher password error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to reset password" },
      { status: 500 }
    );
  }
}
