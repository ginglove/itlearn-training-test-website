import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaces, workspaceTeachers, teachingDays, attendanceRecords } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/users/teachers — teacher profiles + assignments + workload (RSD v9 §9.2)
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const teachers = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isFirstLogin: users.isFirstLogin,
        createdAt: users.createdAt,
        workspaceCount: sql<number>`(
          SELECT COUNT(*) FROM ${workspaceTeachers}
          WHERE ${workspaceTeachers.teacherId} = ${users.id}
        )`,
        conductedDays: sql<number>`(
          SELECT COUNT(DISTINCT td.id)
          FROM ${workspaceTeachers} wt
          JOIN ${teachingDays} td ON td.workspace_id = wt.workspace_id
          WHERE wt.teacher_id = ${users.id}
            AND EXISTS (SELECT 1 FROM ${attendanceRecords} ar WHERE ar.teaching_day_id = td.id)
        )`,
      })
      .from(users)
      .where(eq(users.role, "TEACHER"))
      .orderBy(users.fullName);

    const assignments = await db
      .select({
        teacherId: workspaceTeachers.teacherId,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceStatus: workspaces.status,
      })
      .from(workspaceTeachers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceTeachers.workspaceId));

    const byTeacher = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = byTeacher.get(a.teacherId) ?? [];
      list.push(a);
      byTeacher.set(a.teacherId, list);
    }

    return NextResponse.json({
      status: "SUCCESS",
      teachers: teachers.map((t) => ({
        ...t,
        workspaceCount: Number(t.workspaceCount),
        conductedDays: Number(t.conductedDays),
        workspaces: (byTeacher.get(t.id) ?? []).map((a) => ({
          id: a.workspaceId,
          name: a.workspaceName,
          status: a.workspaceStatus,
        })),
      })),
    });
  } catch (error) {
    console.error("Admin list teachers error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch teachers" },
      { status: 500 }
    );
  }
}

// POST /api/v1/admin/users/teachers — create a teacher account
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
    const [teacher] = await db
      .insert(users)
      .values({
        username,
        fullName,
        email,
        role: "TEACHER",
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
      { status: "SUCCESS", teacher, temporaryPassword: tempPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin create teacher error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create teacher" },
      { status: 500 }
    );
  }
}
