import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAdminId } from "@/lib/admin";

// POST /api/v1/admin/workspaces/:id/unarchive — admin override (RSD v9 §5.1)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = getAdminId(request);
    if (!adminId) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!workspace) {
      return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    }
    if (workspace.status !== "ARCHIVED") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Workspace is not archived" },
        { status: 409 }
      );
    }

    const [updated] = await db
      .update(workspaces)
      .set({ status: "ACTIVE" })
      .where(eq(workspaces.id, id))
      .returning();

    return NextResponse.json({ status: "SUCCESS", workspace: updated });
  } catch (error) {
    console.error("Admin unarchive error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to unarchive workspace" },
      { status: 500 }
    );
  }
}
