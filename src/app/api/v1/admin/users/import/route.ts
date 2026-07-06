import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import * as XLSX from "xlsx";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth";
import { getAdminId } from "@/lib/admin";

// POST /api/v1/admin/users/import?role=TEACHER|STUDENT — bulk-provision
// accounts from .xlsx (columns: username, full_name, email). Existing
// usernames/emails have their full name updated instead of being duplicated.
// Returns temporary credentials for every newly created account.
export async function POST(request: NextRequest) {
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "No file provided" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

    const created: { username: string; fullName: string; email: string; temporaryPassword: string }[] = [];
    const updated: string[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (const [index, row] of rows.entries()) {
      const username = (row.username ?? row.student_id ?? row.teacher_id ?? "").toString().trim();
      const fullName = (row.full_name ?? row.fullName ?? "").toString().trim();
      const email = (row.email ?? "").toString().trim();

      if (!username || !fullName || !email) {
        skipped.push({ row: index + 2, reason: "Missing username, full_name or email" });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ row: index + 2, reason: `Invalid email: ${email}` });
        continue;
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(or(eq(users.username, username), eq(users.email, email)))
        .limit(1);

      if (existing) {
        if (existing.role !== role) {
          skipped.push({ row: index + 2, reason: `${username} exists with a different role` });
          continue;
        }
        await db.update(users).set({ fullName }).where(eq(users.id, existing.id));
        updated.push(username);
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      await db.insert(users).values({
        username,
        fullName,
        email,
        role,
        passwordHash: await hashPassword(temporaryPassword),
        isFirstLogin: true,
      });
      created.push({ username, fullName, email, temporaryPassword });
    }

    return NextResponse.json({ status: "SUCCESS", created, updated, skipped });
  } catch (error) {
    console.error("Import users error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to import users" },
      { status: 500 }
    );
  }
}
