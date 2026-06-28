import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// One-time migration endpoint. Remove after applying.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-migrate-secret");
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    await db.execute(sql`ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS active_seconds integer NOT NULL DEFAULT 0`);
    return NextResponse.json({ status: "SUCCESS", message: "Migration applied" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
