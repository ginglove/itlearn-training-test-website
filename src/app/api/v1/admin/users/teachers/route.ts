import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaces, workspaceTeachers, teachingDays, attendanceRecords } from "@/db/schema";
import { countDistinct, eq, exists, sql } from "drizzle-orm";
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
      })
      .from(users)
      .where(eq(users.role, "TEACHER"))
      .orderBy(users.fullName);

    // Conducted days per teacher: distinct teaching days with at least one
    // roll call record, across the teacher's assigned workspaces
    const conductedRows = await db
      .select({
        teacherId: workspaceTeachers.teacherId,
        days: countDistinct(teachingDays.id),
      })
      .from(workspaceTeachers)
      .innerJoin(teachingDays, eq(teachingDays.workspaceId, workspaceTeachers.workspaceId))
      .where(
        exists(
          db
            .select({ one: sql`1` })
            .from(attendanceRecords)
            .where(eq(attendanceRecords.teachingDayId, teachingDays.id))
        )
      )
      .groupBy(workspaceTeachers.teacherId);
    const conductedByTeacher = new Map(conductedRows.map((r) => [r.teacherId, Number(r.days)]));

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
      teachers: teachers.map((t) => {
        const teacherAssignments = byTeacher.get(t.id) ?? [];
        return {
          ...t,
          workspaceCount: teacherAssignments.length,
          conductedDays: conductedByTeacher.get(t.id) ?? 0,
          workspaces: teacherAssignments.map((a) => ({
            id: a.workspaceId,
            name: a.workspaceName,
            status: a.workspaceStatus,
          })),
        };
      }),
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
