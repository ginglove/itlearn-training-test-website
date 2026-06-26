import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "@/lib/get-user-id";

export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const teacherExams = await db
      .select()
      .from(exams)
      .where(eq(exams.createdBy, teacherId))
      .orderBy(desc(exams.createdAt));

    return NextResponse.json({ status: "SUCCESS", exams: teacherExams });
  } catch (error) {
    console.error("Fetch exams error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch exams" },
      { status: 500 }
    );
  }
}

import { examAssignments } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, duration, startTime, endTime, isShuffled, allowedAttempts, accessType, focusLossPolicy, assignedStudents } = body;

    if (!title || !duration || !startTime || !endTime) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Missing required fields" },
        { status: 400 }
      );
    }

    const newExam = await db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(exams)
        .values({
          title,
          description,
          duration,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          isShuffled: !!isShuffled,
          allowedAttempts: allowedAttempts !== undefined ? parseInt(allowedAttempts) : 1,
          accessType: accessType || "ALL",
          focusLossPolicy: focusLossPolicy || "LOG_ONLY",
          createdBy: teacherId,
        })
        .returning();

      if (accessType === "RESTRICTED" && Array.isArray(assignedStudents) && assignedStudents.length > 0) {
        const values = assignedStudents.map(studentId => ({
          examId: exam.id,
          studentId,
        }));
        await tx.insert(examAssignments).values(values);
      }

      return exam;
    });

    return NextResponse.json({ status: "SUCCESS", exam: newExam }, { status: 201 });
  } catch (error) {
    console.error("Create exam error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create exam" },
      { status: 500 }
    );
  }
}
