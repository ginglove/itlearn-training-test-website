import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// DELETE /api/v1/teacher/students/[id] - Remove a student
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: studentId } = await params;

    // Ensure we only delete STUDENT role accounts
    const [deleted] = await db
      .delete(users)
      .where(and(eq(users.id, studentId), eq(users.role, "STUDENT")))
      .returning({ id: users.id });

    if (!deleted) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Student not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: "SUCCESS", deletedId: deleted.id });
  } catch (error) {
    console.error("Delete student error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to remove student" },
      { status: 500 }
    );
  }
}
