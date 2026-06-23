import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { submissionDetails, codeConfigs, testCases } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { executeCode } from "@/lib/grading/code-executor";
import { Redis } from "@upstash/redis";
import { questions } from "@/db/schema";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// We'll use a secret token to protect this internal route (called by a cron or worker)
const INTERNAL_CRON_SECRET = process.env.INTERNAL_CRON_SECRET || "cron-secret-123";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify internal authorization
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${INTERNAL_CRON_SECRET}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 2. Pull a job from the Upstash Redis queue (right pop)
    const rawJob = await redis.rpop("code_execution_queue");
    if (!rawJob) {
      return NextResponse.json({ status: "IDLE", message: "No jobs in queue" });
    }

    // Handle different return types from upstash
    const jobStr = typeof rawJob === 'string' ? rawJob : JSON.stringify(rawJob);
    const job = JSON.parse(jobStr);

    const { submissionId, questionId, sourceCode, language } = job;

    // 3. Fetch necessary grading configs and test cases from DB
    const [config] = await db
      .select()
      .from(codeConfigs)
      .where(eq(codeConfigs.questionId, questionId));

    const cases = await db
      .select()
      .from(testCases)
      .where(eq(testCases.questionId, questionId));

    if (!cases || cases.length === 0) {
      // Mark as CE (Config Error in this context, or maybe auto-pass if no tests)
      await updateDetailStatus(submissionId, questionId, "CE", 0);
      return NextResponse.json({ status: "ERROR", message: "No test cases found" });
    }

    // 4. Execute Code via Piston
    const executionResult = await executeCode({
      sourceCode,
      language,
      testCases: cases.map(c => ({
        id: c.id,
        input: c.inputData,
        expectedOutput: c.outputData
      })),
      timeLimitMs: config?.timeLimit || 1000,
      memoryLimitKb: config?.memoryLimit || 65536,
    });

    // 5. Calculate final score based on question points
    const [question] = await db.select({ points: questions.points }).from(questions).where(eq(questions.id, questionId));
    
    let finalScore = 0;
    if (question && question.points) {
      const maxPoints = parseFloat(question.points as string);
      finalScore = parseFloat(((executionResult.scorePercentage / 100) * maxPoints).toFixed(2));
    }

    // 6. Update Database
    await updateDetailStatus(
      submissionId,
      questionId,
      executionResult.overallStatus,
      finalScore
    );

    return NextResponse.json({
      status: "SUCCESS",
      executionResult,
    });

  } catch (error) {
    console.error("Code execution worker error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Worker failed" },
      { status: 500 }
    );
  }
}

async function updateDetailStatus(submissionId: string, questionId: string, status: any, score: number) {
  await db
    .update(submissionDetails)
    .set({ status, score: score.toString() })
    .where(
      and(
        eq(submissionDetails.submissionId, submissionId),
        eq(submissionDetails.questionId, questionId)
      )
    );
}
