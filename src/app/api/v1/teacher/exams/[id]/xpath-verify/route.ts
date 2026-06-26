import { NextRequest, NextResponse } from "next/server";
import { verifyReferenceSelector } from "@/lib/grading/xpath-evaluator";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = request.headers.get("x-user-id");
    if (!teacherId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    await params;

    const body = await request.json();
    const { selectorType, targetType, targetPayload, referenceSelector } = body;

    if (!selectorType || !targetType || !targetPayload || !referenceSelector) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "selectorType, targetType, targetPayload, and referenceSelector are required." }, { status: 400 });
    }

    if (!["XPATH", "CSS"].includes(selectorType)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "selectorType must be XPATH or CSS." }, { status: 400 });
    }

    if (!["URL", "HTML"].includes(targetType)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "targetType must be URL or HTML." }, { status: 400 });
    }

    const result = await verifyReferenceSelector({ selectorType, targetType, targetPayload, referenceSelector });

    return NextResponse.json(result);
  } catch (error) {
    console.error("XPath verify error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
