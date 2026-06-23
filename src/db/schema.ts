import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["TEACHER", "STUDENT"]);
export const questionTypeEnum = pgEnum("question_type", ["QUIZ", "CODE"]);
export const executionStatusEnum = pgEnum("execution_status", [
  "AC",
  "WA",
  "CE",
  "RE",
  "TLE",
]);

// ── Users ──────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 100 }).unique().notNull(),
  role: userRoleEnum("role").notNull().default("STUDENT"),
  isFirstLogin: boolean("is_first_login").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Exams ──────────────────────────────────────────────────────────────────────
export const exams = pgTable(
  "exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 150 }).notNull(),
    description: text("description"),
    duration: integer("duration").notNull(), // minutes
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    isShuffled: boolean("is_shuffled").notNull().default(false),
    allowedAttempts: integer("allowed_attempts").default(1).notNull(),
    accessType: varchar("access_type", { length: 20 }).default("ALL").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_exams_dates").on(table.startTime, table.endTime)]
);

// ── Questions ──────────────────────────────────────────────────────────────────
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    content: text("content").notNull(),
    points: decimal("points", { precision: 5, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_questions_exam_id").on(table.examId)]
);

// ── Quiz Options ───────────────────────────────────────────────────────────────
export const quizOptions = pgTable(
  "quiz_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    optionText: text("option_text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => [index("idx_quiz_options_question_id").on(table.questionId)]
);

// ── Code Configs ───────────────────────────────────────────────────────────────
export const codeConfigs = pgTable("code_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .unique()
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  timeLimit: integer("time_limit").notNull().default(1000), // ms
  memoryLimit: integer("memory_limit").notNull().default(65536), // KB (64MB)
  starterCode: text("starter_code"),
  teacherCode: text("teacher_code"),
});

// ── Test Cases ─────────────────────────────────────────────────────────────────
export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    inputData: text("input_data").notNull(),
    outputData: text("output_data").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
  },
  (table) => [index("idx_test_cases_question_id").on(table.questionId)]
);

// ── Exam Submissions ───────────────────────────────────────────────────────────
export const examSubmissions = pgTable(
  "exam_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    totalScore: decimal("total_score", { precision: 5, scale: 2 }).default(
      "0.00"
    ),
    clientIp: varchar("client_ip", { length: 45 }).notNull(),
    focusLossCount: integer("focus_loss_count").notNull().default(0),
    attempt: integer("attempt").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("one_submission_per_student_exam_attempt").on(
      table.examId,
      table.studentId,
      table.attempt
    ),
    index("idx_submissions_lookup").on(table.examId, table.studentId),
  ]
);

// ── Submission Details ─────────────────────────────────────────────────────────
export const submissionDetails = pgTable(
  "submission_details",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => examSubmissions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    selectedOptions: text("selected_options").array().default([]),
    sourceCode: text("source_code"),
    language: varchar("language", { length: 30 }),
    status: executionStatusEnum("status"),
    score: decimal("score", { precision: 5, scale: 2 }).notNull().default("0.00"),
  },
  (table) => [
    uniqueIndex("unique_question_per_submission").on(
      table.submissionId,
      table.questionId
    ),
    index("idx_submission_details_lookup").on(table.submissionId),
  ]
);

// ── Exam Assignments ───────────────────────────────────────────────────────────
export const examAssignments = pgTable(
  "exam_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("unique_exam_student_assignment").on(
      table.examId,
      table.studentId
    ),
    index("idx_exam_assignments_lookup").on(table.examId),
  ]
);

// ── Platform Settings ──────────────────────────────────────────────────────────
export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  pistonApiUrl: varchar("piston_api_url", { length: 255 }).notNull().default("https://emkc.org/api/v2/piston"),
  queueBackend: varchar("queue_backend", { length: 100 }).notNull().default("Upstash Redis"),
  sessionType: varchar("session_type", { length: 100 }).notNull().default("JWT (HTTP-only Cookie)"),
  ipBinding: boolean("ip_binding").notNull().default(true),
  passwordResetEnforced: boolean("password_reset_enforced").notNull().default(true),
  focusTrackingEnabled: boolean("focus_tracking_enabled").notNull().default(true),
  autoSaveInterval: integer("auto_save_interval").notNull().default(15), // seconds
  executionMode: varchar("execution_mode", { length: 30 }).notNull().default("LOCAL_FALLBACK"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

