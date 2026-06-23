import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { fullName } = body;

    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Full name must be at least 2 characters." },
        { status: 400 }
      );
    }

    const trimmed = fullName.trim();
    if (trimmed.length > 100) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Full name must be at most 100 characters." },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ fullName: trimmed })
      .where(eq(users.id, userId));

    return NextResponse.json({
      status: "SUCCESS",
      message: "Full name updated successfully.",
      fullName: trimmed,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update profile." },
      { status: 500 }
    );
  }
}
