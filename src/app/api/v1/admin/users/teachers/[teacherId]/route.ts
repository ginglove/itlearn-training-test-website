import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, exams, workspaceTeachers } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

async function getTeacher(teacherId: string) {
  const [teacher] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, teacherId), eq(users.role, "TEACHER")))
    .limit(1);
  return teacher ?? null;
}

// PUT /api/v1/admin/users/teachers/:teacherId — edit fullName/email
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { teacherId } = await params;

    const teacher = await getTeacher(teacherId);
    if (!teacher) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teacher not found" }, { status: 404 });
    }

    const body = await request.json();
    const { fullName, email } = body;
    const updates: Record<string, string> = {};

    if (fullName !== undefined) {
      const trimmed = String(fullName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Full name must be 2-100 characters." },
          { status: 400 }
        );
      }
      updates.fullName = trimmed;
    }
    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid email address." },
          { status: 400 }
        );
      }
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, trimmed), ne(users.id, teacherId)))
        .limit(1);
      if (taken) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Email is already in use." },
          { status: 409 }
        );
      }
      updates.email = trimmed;
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
      .where(eq(users.id, teacherId))
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
      });

    return NextResponse.json({ status: "SUCCESS", teacher: updated });
  } catch (error) {
    console.error("Admin update teacher error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update teacher" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/admin/users/teachers/:teacherId — remove a teacher account.
// Blocked while the teacher still has exams or workspace assignments, since
// deleting the user would cascade into exam and workspace data.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { teacherId } = await params;

    const teacher = await getTeacher(teacherId);
    if (!teacher) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Teacher not found" }, { status: 404 });
    }

    const [exam] = await db
      .select({ id: exams.id })
      .from(exams)
      .where(eq(exams.createdBy, teacherId))
      .limit(1);
    const [assignment] = await db
      .select({ id: workspaceTeachers.id })
      .from(workspaceTeachers)
      .where(eq(workspaceTeachers.teacherId, teacherId))
      .limit(1);

    if (exam || assignment) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message:
            "Teacher still owns exams or workspace assignments. Reassign or remove those first.",
        },
        { status: 409 }
      );
    }

    await db.delete(users).where(eq(users.id, teacherId));
    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("Admin delete teacher error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete teacher" },
      { status: 500 }
    );
  }
}
