import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, platformSettings } from "@/db/schema";
import { verifyPassword, generateToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Username and password are required." },
        { status: 400 }
      );
    }

    // Look up user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "The username or password provided is incorrect." },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "The username or password provided is incorrect." },
        { status: 401 }
      );
    }

    // Bind client IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Fetch platform settings
    let ipBindingEnabled = true;
    let passwordResetEnforced = true;
    try {
      const [settings] = await db.select().from(platformSettings).limit(1);
      if (settings) {
        ipBindingEnabled = settings.ipBinding;
        passwordResetEnforced = settings.passwordResetEnforced;
      }
    } catch (err) {
      console.error("Failed to fetch settings in login", err);
    }

    const boundIp = ipBindingEnabled ? clientIp : "unknown";

    // Check first login → force password reset
    if (user.isFirstLogin && passwordResetEnforced) {
      const resetToken = await generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        boundIp,
      });

      return NextResponse.json({
        status: "FORCE_PASSWORD_RESET",
        reset_token: resetToken,
      });
    }

    // Generate session token
    const token = await generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      boundIp,
    });

    return NextResponse.json({
      status: "SUCCESS",
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_first_login: user.isFirstLogin,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
