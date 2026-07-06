import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// PUT — bulk update topics (and notes) for many teaching days at once
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = getUserId(request, "teacher");
    if (!teacherId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;

    const workspace = await getOwnedWorkspace(teacherId, id, isAdminRequest(request));
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    if (workspace.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "WORKSPACE_ARCHIVED", message: "Archived workspaces are read-only" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const items: { dayId: string; topic?: string | null; notes?: string | null }[] =
      Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "items is required" },
        { status: 400 }
      );
    }

    // Only days that belong to this workspace can be touched
    const owned = await db
      .select({ id: teachingDays.id })
      .from(teachingDays)
      .where(
        and(
          eq(teachingDays.workspaceId, id),
          inArray(teachingDays.id, items.map((i) => i.dayId))
        )
      );
    const ownedIds = new Set(owned.map((d) => d.id));

    let updated = 0;
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (!ownedIds.has(item.dayId)) continue;
        await tx
          .update(teachingDays)
          .set({
            ...(item.topic !== undefined ? { topic: item.topic?.trim() || null } : {}),
            ...(item.notes !== undefined ? { notes: item.notes?.trim() || null } : {}),
          })
          .where(eq(teachingDays.id, item.dayId));
        updated++;
      }
    });

    return NextResponse.json({ status: "SUCCESS", updated });
  } catch (error) {
    console.error("Bulk update topics error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update topics" },
      { status: 500 }
    );
  }
}
