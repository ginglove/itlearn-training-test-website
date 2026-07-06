import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/users/export?role=TEACHER|STUDENT — download the user list
// as .xlsx (username, full_name, email, status). The same columns are accepted
// by the import endpoint.
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const role = new URL(request.url).searchParams.get("role");
    if (role !== "TEACHER" && role !== "STUDENT") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "role must be TEACHER or STUDENT" },
        { status: 400 }
      );
    }

    const list = await db
      .select({
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        isActive: users.isActive,
        isFirstLogin: users.isFirstLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, role))
      .orderBy(users.fullName);

    const rows = list.map((u) => ({
      username: u.username,
      full_name: u.fullName,
      email: u.email,
      status: u.isActive ? "ACTIVE" : "DEACTIVATED",
      first_login_pending: u.isFirstLogin ? "YES" : "",
      created_at: u.createdAt.toISOString().slice(0, 10),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, role === "TEACHER" ? "Teachers" : "Students");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${role.toLowerCase()}s_export.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export users error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to export users" },
      { status: 500 }
    );
  }
}
