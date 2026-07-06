import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const role = request.headers.get("x-user-role");
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    // GET is readable by any authenticated user (the exam workspace needs
    // autoSaveInterval / focusTrackingEnabled); mutation is admin-only.

    let [settings] = await db.select().from(platformSettings).limit(1);

    if (!settings) {
      // Fallback/Self-heal if no settings row is present
      const [newSettings] = await db
        .insert(platformSettings)
        .values({
          pistonApiUrl: "https://emkc.org/api/v2/piston",
          queueBackend: "Upstash Redis",
          sessionType: "JWT (HTTP-only Cookie)",
          ipBinding: true,
          passwordResetEnforced: true,
          focusTrackingEnabled: true,
          autoSaveInterval: 15,
          executionMode: "LOCAL_FALLBACK",
        })
        .returning();
      settings = newSettings;
    }

    return NextResponse.json({ status: "SUCCESS", settings });
  } catch (error) {
    console.error("Fetch settings error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const role = request.headers.get("x-user-role");

    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (role !== "ADMIN") {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only admins can modify platform settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      pistonApiUrl,
      queueBackend,
      sessionType,
      ipBinding,
      passwordResetEnforced,
      focusTrackingEnabled,
      autoSaveInterval,
      executionMode,
    } = body;

    // Check if a settings row exists
    const [existing] = await db.select().from(platformSettings).limit(1);

    let updatedSettings;
    if (existing) {
      [updatedSettings] = await db
        .update(platformSettings)
        .set({
          pistonApiUrl: pistonApiUrl ?? existing.pistonApiUrl,
          queueBackend: queueBackend ?? existing.queueBackend,
          sessionType: sessionType ?? existing.sessionType,
          ipBinding: ipBinding !== undefined ? !!ipBinding : existing.ipBinding,
          passwordResetEnforced:
            passwordResetEnforced !== undefined
              ? !!passwordResetEnforced
              : existing.passwordResetEnforced,
          focusTrackingEnabled:
            focusTrackingEnabled !== undefined
              ? !!focusTrackingEnabled
              : existing.focusTrackingEnabled,
          autoSaveInterval: (() => {
            const parsed = parseInt(autoSaveInterval, 10);
            return autoSaveInterval !== undefined && !isNaN(parsed) && parsed > 0 ? parsed : existing.autoSaveInterval;
          })(),
          executionMode: executionMode ?? existing.executionMode,
          updatedAt: new Date(),
        })
        .where(eq(platformSettings.id, existing.id))
        .returning();
    } else {
      [updatedSettings] = await db
        .insert(platformSettings)
        .values({
          pistonApiUrl: pistonApiUrl || "https://emkc.org/api/v2/piston",
          queueBackend: queueBackend || "Upstash Redis",
          sessionType: sessionType || "JWT (HTTP-only Cookie)",
          ipBinding: ipBinding !== undefined ? !!ipBinding : true,
          passwordResetEnforced:
            passwordResetEnforced !== undefined ? !!passwordResetEnforced : true,
          focusTrackingEnabled:
            focusTrackingEnabled !== undefined ? !!focusTrackingEnabled : true,
          autoSaveInterval:
            autoSaveInterval !== undefined ? parseInt(autoSaveInterval) : 15,
          executionMode: executionMode || "LOCAL_FALLBACK",
        })
        .returning();
    }

    return NextResponse.json({ status: "SUCCESS", settings: updatedSettings });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update settings" },
      { status: 500 }
    );
  }
}

// Helper to query settings by ID
import { eq } from "drizzle-orm";
