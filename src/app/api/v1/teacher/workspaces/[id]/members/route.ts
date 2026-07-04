import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceMemberships, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }

    const members = await db
      .select({
        membershipId: workspaceMemberships.id,
        studentId: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        status: workspaceMemberships.status,
        joinedAt: workspaceMemberships.joinedAt,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.studentId))
      .where(eq(workspaceMemberships.workspaceId, id))
      .orderBy(users.fullName);

    return NextResponse.json({ status: "SUCCESS", members });
  } catch (error) {
    console.error("Get members error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];
    if (studentIds.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "studentIds is required" },
        { status: 400 }
      );
    }

    // Validate that all ids are STUDENT users
    const students = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, studentIds), eq(users.role, "STUDENT")));
    const validIds = new Set(students.map((s) => s.id));
    const invalid = studentIds.filter((sid) => !validIds.has(sid));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: `Invalid student ids: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }

    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, id),
            inArray(workspaceMemberships.studentId, studentIds)
          )
        );
      const existingByStudent = new Map(existing.map((m) => [m.studentId, m]));

      const toInsert = studentIds.filter((sid) => !existingByStudent.has(sid));
      const toReactivate = existing.filter((m) => m.status === "REMOVED").map((m) => m.id);

      if (toInsert.length > 0) {
        await tx
          .insert(workspaceMemberships)
          .values(toInsert.map((sid) => ({ workspaceId: id, studentId: sid })));
      }
      if (toReactivate.length > 0) {
        await tx
          .update(workspaceMemberships)
          .set({ status: "ACTIVE" })
          .where(inArray(workspaceMemberships.id, toReactivate));
      }
    });

    return NextResponse.json({ status: "SUCCESS" }, { status: 201 });
  } catch (error) {
    console.error("Add members error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to add members" },
      { status: 500 }
    );
  }
}
