import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams, examAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId)))
      .limit(1);

    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    // Get assignments if restricted
    let assignedStudents: string[] = [];
    if (exam.accessType === "RESTRICTED") {
      const assignments = await db
        .select({ studentId: examAssignments.studentId })
        .from(examAssignments)
        .where(eq(examAssignments.examId, examId));
      assignedStudents = assignments.map(a => a.studentId);
    }

    return NextResponse.json({ status: "SUCCESS", exam: { ...exam, assignedStudents } });
  } catch (error) {
    console.error("GET exam detail error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch exam details" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;
    const body = await request.json();
    const { title, description, duration, startTime, endTime, isShuffled, allowedAttempts, accessType, assignedStudents } = body;

    // Verify ownership
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId)))
      .limit(1);

    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      // Update exam
      await tx
        .update(exams)
        .set({
          title: title ?? exam.title,
          description: description !== undefined ? description : exam.description,
          duration: duration !== undefined ? parseInt(duration) : exam.duration,
          startTime: startTime ? new Date(startTime) : exam.startTime,
          endTime: endTime ? new Date(endTime) : exam.endTime,
          isShuffled: isShuffled !== undefined ? !!isShuffled : exam.isShuffled,
          allowedAttempts: allowedAttempts !== undefined ? parseInt(allowedAttempts) : exam.allowedAttempts,
          accessType: accessType ?? exam.accessType,
        })
        .where(eq(exams.id, examId));

      // Sync assignments
      const finalAccessType = accessType ?? exam.accessType;
      if (finalAccessType === "RESTRICTED" && Array.isArray(assignedStudents)) {
        // Delete all old
        await tx.delete(examAssignments).where(eq(examAssignments.examId, examId));
        // Insert new
        if (assignedStudents.length > 0) {
          const values = assignedStudents.map(studentId => ({
            examId,
            studentId,
          }));
          await tx.insert(examAssignments).values(values);
        }
      } else {
        // If changed back to ALL, clear assignments just in case
        await tx.delete(examAssignments).where(eq(examAssignments.examId, examId));
      }
    });

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("PUT exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update exam" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: examId } = await params;

    // Verify ownership
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.createdBy, teacherId)))
      .limit(1);

    if (!exam) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Exam not found" }, { status: 404 });
    }

    await db.delete(exams).where(eq(exams.id, examId));

    return NextResponse.json({ status: "SUCCESS" });
  } catch (error) {
    console.error("DELETE exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete exam" },
      { status: 500 }
    );
  }
}
