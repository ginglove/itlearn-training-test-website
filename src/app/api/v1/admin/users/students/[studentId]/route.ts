import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, examSubmissions } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

async function getStudent(studentId: string) {
  const [student] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, "STUDENT")))
    .limit(1);
  return student ?? null;
}

// PUT — edit profile and/or toggle activation { fullName?, email?, isActive? }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { studentId } = await params;

    const student = await getStudent(studentId);
    if (!student) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Student not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.fullName !== undefined) {
      const trimmed = String(body.fullName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Full name must be 2-100 characters." },
          { status: 400 }
        );
      }
      updates.fullName = trimmed;
    }
    if (body.email !== undefined) {
      const trimmed = String(body.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid email address." },
          { status: 400 }
        );
      }
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, trimmed), ne(users.id, studentId)))
        .limit(1);
      if (taken) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Email is already in use." },
          { status: 409 }
        );
      }
      updates.email = trimmed;
    }
    if (typeof body.isActive === "boolean") {
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Nothing to update." },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, studentId))
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isActive: users.isActive,
      });

    return NextResponse.json({ status: "SUCCESS", student: updated });
  } catch (error) {
    console.error("Admin update student error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update student" },
      { status: 500 }
    );
  }
}

// DELETE — remove a student account. Blocked while submissions exist, since
// deleting the user cascades into submission history.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { studentId } = await params;

    const student = await getStudent(studentId);
    if (!student) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Student not found" }, { status: 404 });
    }

    const [submission] = await db
      .select({ id: examSubmissions.id })
      .from(examSubmissions)
      .where(eq(examSubmissions.studentId, studentId))
      .limit(1);
    if (submission) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: "Student has exam submissions. Deactivate the account instead of deleting it.",
        },
        { status: 409 }
      );
    }

    await db.delete(users).where(eq(users.id, studentId));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Admin delete student error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete student" },
      { status: 500 }
    );
  }
}
