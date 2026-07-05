import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teachingDays } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getUserId, isAdminRequest } from "@/lib/get-user-id";
import { getOwnedWorkspace } from "@/lib/workspace";

// Normalize a Date column value (xlsx serials, Date objects, or strings)
function toISODateValue(value: unknown): string | null {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const str = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

// POST — import topics/notes from the exported .xlsx, matched by Date
export async function POST(
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "No file provided" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

    const days = await db
      .select({ id: teachingDays.id, scheduledDate: teachingDays.scheduledDate })
      .from(teachingDays)
      .where(eq(teachingDays.workspaceId, id));
    const dayByDate = new Map(days.map((d) => [d.scheduledDate, d.id]));

    let updated = 0;
    const unmatched: string[] = [];
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const iso = toISODateValue(row.Date ?? row.date);
        if (!iso) continue;
        const dayId = dayByDate.get(iso);
        if (!dayId) {
          unmatched.push(iso);
          continue;
        }
        const topic = row.Topic ?? row.topic;
        const notes = row.Notes ?? row.notes;
        await tx
          .update(teachingDays)
          .set({
            ...(topic !== undefined ? { topic: String(topic).trim() || null } : {}),
            ...(notes !== undefined ? { notes: String(notes).trim() || null } : {}),
          })
          .where(eq(teachingDays.id, dayId));
        updated++;
      }
    });

    return NextResponse.json({ status: "SUCCESS", updated, unmatched });
  } catch (error) {
    console.error("Import timetable error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to import timetable" },
      { status: 500 }
    );
  }
}
