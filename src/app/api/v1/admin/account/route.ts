import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// GET /api/v1/admin/account — the authenticated admin's profile
export async function GET(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const [account] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, adminId))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Admin account not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "SUCCESS", account });
  } catch (error) {
    console.error("Get admin account error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch account" },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/admin/account — update the admin's own full name and email
export async function PATCH(request: NextRequest) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { fullName, email } = body;

    const updates: Record<string, string> = {};

    if (fullName !== undefined) {
      const trimmed = String(fullName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Full name must be 2-100 characters." },
          { status: 400 }
        );
      }
      updates.fullName = trimmed;
    }

    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Invalid email address." },
          { status: 400 }
        );
      }
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, trimmed), ne(users.id, adminId)))
        .limit(1);
      if (taken) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Email is already in use by another account." },
          { status: 409 }
        );
      }
      updates.email = trimmed;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Nothing to update." },
        { status: 400 }
      );
    }

    const [account] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, adminId))
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
      });

    return NextResponse.json({ status: "SUCCESS", account });
  } catch (error) {
    console.error("Update admin account error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update account" },
      { status: 500 }
    );
  }
}
