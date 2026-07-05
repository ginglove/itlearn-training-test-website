import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getWorkspaceExamIds } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let teacherExams = await db
      .select()
      .from(exams)
      .where((isAdminRequest(request) ? sql`TRUE` : eq(exams.createdBy, teacherId)))
      .orderBy(desc(exams.createdAt));

    // Global class filter: only exams assigned to the selected workspace
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (workspaceId) {
      const wsExamIds = await getWorkspaceExamIds(workspaceId);
      teacherExams = teacherExams.filter((e) => wsExamIds.has(e.id));
    }

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
    const { title, description, duration, startTime, endTime, isShuffled, allowedAttempts, accessType, sessionType, focusLossPolicy, assignedStudents } = body;

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
          sessionType: sessionType || "QUIZ",
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
