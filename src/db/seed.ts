import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
// Ensure you run this with DATABASE_URL in your environment
const queryClient = postgres(process.env.DATABASE_URL!);
const db = drizzle(queryClient, { schema });

async function seed() {
  console.log("🌱 Starting database seed...");

  try {
    // 1. Create a Teacher
    console.log("Creating Teacher account...");
    const teacherId = "00000000-0000-0000-0000-000000000001";
    const teacherPassword = await bcrypt.hash("Teacher@123!", 10);

    await db.insert(schema.users).values({
      id: teacherId,
      username: "teacher_admin",
      fullName: "Admin Teacher",
      email: "teacher@example.com",
      passwordHash: teacherPassword,
      role: "TEACHER",
      isFirstLogin: false, // Don't force reset for the seeded teacher
    }).onConflictDoNothing();

    // 1b. Create a platform Admin (RSD v9 three-tier governance)
    console.log("Creating Admin account...");
    const adminId = "00000000-0000-0000-0000-000000000003";
    const adminPassword = await bcrypt.hash("Admin@123!", 10);

    await db.insert(schema.users).values({
      id: adminId,
      username: "platform_admin",
      fullName: "Platform Admin",
      email: "admin@example.com",
      passwordHash: adminPassword,
      role: "ADMIN",
      isFirstLogin: false,
    }).onConflictDoNothing();

    // 2. Create a Student
    console.log("Creating Student account...");
    const studentId = "00000000-0000-0000-0000-000000000002";
    const studentPassword = await bcrypt.hash("Student@123!", 10);

    await db.insert(schema.users).values({
      id: studentId,
      username: "student_01",
      fullName: "John Doe",
      email: "student@example.com",
      passwordHash: studentPassword,
      role: "STUDENT",
      isFirstLogin: false, // Don't force reset for seeded student to test easily
    }).onConflictDoNothing();

    // 3. Create a Demo Exam
    console.log("Creating Demo Exam...");
    const examId = randomUUID();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db.insert(schema.exams).values({
      id: examId,
      title: "Introduction to Programming",
      description: "A quick test of Python fundamentals and logic.",
      createdBy: teacherId,
      startTime: now,
      endTime: tomorrow,
      duration: 60,
      isShuffled: false,
    }).onConflictDoNothing();

    // 4. Create Quiz Question
    console.log("Creating Questions...");
    const q1Id = randomUUID();
    await db.insert(schema.questions).values({
      id: q1Id,
      examId: examId,
      type: "QUIZ",
      title: "Python Operators",
      content: "What is the output of `print(2 ** 3)` in Python?",
      points: "10.00",
      sortOrder: 1,
    });

    await db.insert(schema.quizOptions).values([
      { questionId: q1Id, optionText: "5", isCorrect: false },
      { questionId: q1Id, optionText: "6", isCorrect: false },
      { questionId: q1Id, optionText: "8", isCorrect: true },
      { questionId: q1Id, optionText: "9", isCorrect: false },
    ]);

    // 5. Create Code Question
    const q2Id = randomUUID();
    await db.insert(schema.questions).values({
      id: q2Id,
      examId: examId,
      type: "CODE",
      title: "Write Sum Function",
      content: "Write a function `add(a, b)` that returns the sum of two numbers. Print the result of `add(5, 7)`.",
      points: "20.00",
      sortOrder: 2,
    });

    // 6. Create Code Config & Test Cases
    console.log("Configuring Code Execution Environments...");
    await db.insert(schema.codeConfigs).values({
      questionId: q2Id,
      timeLimit: 2000,
      memoryLimit: 128000, // 128 MB
      starterCode: `// Viết hàm add(a, b) trả về tổng của hai số.
// In ra kết quả của add(5, 7).
`,
      teacherCode: `function add(a, b) {
    return a + b;
}
console.log(add(5, 7));
`,
    });

    await db.insert(schema.testCases).values([
      { questionId: q2Id, inputData: "", outputData: "12", isHidden: false },
    ]);

    // 7. Seed default platform settings
    console.log("Seeding default platform settings...");
    await db.insert(schema.platformSettings).values({
      pistonApiUrl: "https://emkc.org/api/v2/piston",
      queueBackend: "Upstash Redis",
      sessionType: "JWT (HTTP-only Cookie)",
      ipBinding: true,
      passwordResetEnforced: true,
      focusTrackingEnabled: true,
      autoSaveInterval: 15,
      executionMode: "LOCAL_FALLBACK",
    });

    console.log("✅ Seed completed successfully!");
    console.log("------------------------------------------");
    console.log(`Admin Login   -> Username: platform_admin | Password: Admin@123!`);
    console.log(`Teacher Login -> Username: teacher_admin | Password: Teacher@123!`);
    console.log(`Student Login -> Username: student_01    | Password: Student@123!`);
    console.log("------------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
