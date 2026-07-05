import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getTeacherScopedStudentIds } from "@/lib/workspace";
import { isAdminRequest } from "@/lib/get-user-id";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";

// GET /api/v1/teacher/students - List students scoped to the teacher's assigned
// workspaces (RSD v9 §2.3). ?scope=all returns a minimal global directory used
// only by the workspace enrollment picker.
export async function GET(request: NextRequest) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("scope") === "all") {
      // Minimal directory for enrolling students into an assigned workspace
      const directory = await db
        .select({ id: users.id, username: users.username, fullName: users.fullName })
        .from(users)
        .where(eq(users.role, "STUDENT"))
        .orderBy(users.fullName);
      return NextResponse.json({ status: "SUCCESS", students: directory });
    }

    // Admins see the full student roster; teachers only their workspace members
    const isAdminUser = isAdminRequest(request);
    let scopedIds = isAdminUser ? [] : await getTeacherScopedStudentIds(teacherId);

    // Global class filter: restrict to the selected workspace's ACTIVE members
    const workspaceFilter = searchParams.get("workspaceId");
    if (workspaceFilter) {
      const { workspaceMemberships } = await import("@/db/schema");
      const members = await db
        .select({ studentId: workspaceMemberships.studentId })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceFilter),
            eq(workspaceMemberships.status, "ACTIVE")
          )
        );
      const memberIds = new Set(members.map((m) => m.studentId));
      scopedIds = isAdminUser
        ? [...memberIds]
        : scopedIds.filter((sid) => memberIds.has(sid));
      if (scopedIds.length === 0) {
        return NextResponse.json({ status: "SUCCESS", students: [] });
      }
    }

    if (!isAdminUser && !workspaceFilter && scopedIds.length === 0) {
      return NextResponse.json({ status: "SUCCESS", students: [] });
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
      .where(
        isAdminUser && scopedIds.length === 0
          ? eq(users.role, "STUDENT")
          : and(eq(users.role, "STUDENT"), inArray(users.id, scopedIds))
      )
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
    // Student account creation is Admin-only (v9.2 governance)
    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only admins can create student accounts" },
        { status: 403 }
      );
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
