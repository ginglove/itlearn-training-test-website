import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaces, exams, questions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/dashboard/stats — global counters (RSD v9.1 §4.1), fetched atomically
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const [stats] = await db
      .select({
        totalActiveStudents: sql<number>`(SELECT COUNT(*) FROM ${users} WHERE ${users.role} = 'STUDENT')`,
        totalActiveTeachers: sql<number>`(SELECT COUNT(*) FROM ${users} WHERE ${users.role} = 'TEACHER')`,
        totalActiveWorkspaces: sql<number>`(SELECT COUNT(*) FROM ${workspaces} WHERE ${workspaces.status} = 'ACTIVE')`,
        totalExams: sql<number>`(SELECT COUNT(*) FROM ${exams})`,
        totalQuestions: sql<number>`(SELECT COUNT(*) FROM ${questions})`,
      })
      .from(sql`(SELECT 1) AS one`);

    return NextResponse.json({
      status: "SUCCESS",
      stats: {
        totalActiveStudents: Number(stats.totalActiveStudents),
        totalActiveTeachers: Number(stats.totalActiveTeachers),
        totalActiveWorkspaces: Number(stats.totalActiveWorkspaces),
        totalExams: Number(stats.totalExams),
        totalQuestions: Number(stats.totalQuestions),
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
