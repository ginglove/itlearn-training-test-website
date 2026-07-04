import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaceMemberships } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/users/students — student profiles + workspace enrollment metrics
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const students = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isFirstLogin: users.isFirstLogin,
        createdAt: users.createdAt,
        activeWorkspaces: sql<number>`(
          SELECT COUNT(*) FROM ${workspaceMemberships}
          WHERE ${workspaceMemberships.studentId} = ${users.id}
            AND ${workspaceMemberships.status} = 'ACTIVE'
        )`,
      })
      .from(users)
      .where(eq(users.role, "STUDENT"))
      .orderBy(users.fullName);

    return NextResponse.json({
      status: "SUCCESS",
      students: students.map((s) => ({ ...s, activeWorkspaces: Number(s.activeWorkspaces) })),
    });
  } catch (error) {
    console.error("Admin list students error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch students" },
      { status: 500 }
    );
  }
}

// POST /api/v1/admin/users/students — create a student account
export async function POST(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { username, fullName, email } = body;
    if (!username || !fullName || !email) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "username, fullName and email are required" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.username} = ${username} OR ${users.email} = ${email}`)
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Username or email already exists" },
        { status: 409 }
      );
    }

    const tempPassword = generateTemporaryPassword();
    const [student] = await db
      .insert(users)
      .values({
        username,
        fullName,
        email,
        role: "STUDENT",
        passwordHash: await hashPassword(tempPassword),
        isFirstLogin: true,
      })
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
      });

    return NextResponse.json(
      { status: "SUCCESS", student, temporaryPassword: tempPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin create student error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create student" },
      { status: 500 }
    );
  }
}
