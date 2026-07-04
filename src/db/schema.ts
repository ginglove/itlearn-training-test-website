import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  json,
  pgEnum,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["TEACHER", "STUDENT"]);
export const questionTypeEnum = pgEnum("question_type", ["QUIZ", "CODE", "XPATH"]);
export const workspaceStatusEnum = pgEnum("workspace_status", ["ACTIVE", "ARCHIVED"]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "REMOVED"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "EXERCISE",
  "HOMEWORK",
  "ASSESSMENT",
  "QUIZ",
]);
export const executionStatusEnum = pgEnum("execution_status", [
  "AC",
  "WA",
  "CE",
  "RE",
  "TLE",
  "OFE",
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
    duration: integer("duration").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    isShuffled: boolean("is_shuffled").notNull().default(false),
    allowedAttempts: integer("allowed_attempts").default(1).notNull(),
    accessType: varchar("access_type", { length: 20 }).default("ALL").notNull(),
    sessionType: varchar("session_type", { length: 20 }).default("QUIZ").notNull(),
    focusLossPolicy: varchar("focus_loss_policy", { length: 20 }).notNull().default("LOG_ONLY"),
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
  timeLimit: integer("time_limit").notNull().default(1000),
  memoryLimit: integer("memory_limit").notNull().default(65536),
  starterCode: text("starter_code"),
  teacherCode: text("teacher_code"),
});

// ── XPath Configs ──────────────────────────────────────────────────────────────
export const xpathConfigs = pgTable("xpath_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .unique()
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectorType: varchar("selector_type", { length: 10 }).notNull().default("XPATH"),
});

// ── XPath Test Cases ───────────────────────────────────────────────────────────
export const xpathTestCases = pgTable(
  "xpath_test_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 10 }).notNull().default("HTML"),
    selectorType: varchar("selector_type", { length: 10 }).notNull().default("XPATH"),
    targetPayload: text("target_payload").notNull(),
    referenceSelector: text("reference_selector").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
  },
  (table) => [index("idx_xpath_test_cases_question_id").on(table.questionId)]
);

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
    questionOrder: json("question_order").$type<string[]>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    totalScore: decimal("total_score", { precision: 5, scale: 2 }).default(
      "0.00"
    ),
    clientIp: varchar("client_ip", { length: 45 }).notNull(),
    focusLossCount: integer("focus_loss_count").notNull().default(0),
    closeReason: varchar("close_reason", { length: 50 }),
    activeSeconds: integer("active_seconds").notNull().default(0),
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
    studentXpath: text("student_xpath"),
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

// ── Workspaces ─────────────────────────────────────────────────────────────────
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: workspaceStatusEnum("status").notNull().default("ACTIVE"),
    totalDays: integer("total_days").notNull().default(0),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_workspaces_created_by").on(table.createdBy)]
);

// ── Workspace Memberships ──────────────────────────────────────────────────────
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatusEnum("status").notNull().default("ACTIVE"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("unique_workspace_student").on(table.workspaceId, table.studentId),
    index("idx_memberships_workspace").on(table.workspaceId),
  ]
);

// ── Teaching Days ──────────────────────────────────────────────────────────────
export const teachingDays = pgTable(
  "teaching_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    topic: varchar("topic", { length: 200 }),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("unique_workspace_day_number").on(table.workspaceId, table.dayNumber),
    uniqueIndex("unique_workspace_day_date").on(table.workspaceId, table.scheduledDate),
  ]
);

// ── Attendance Records ─────────────────────────────────────────────────────────
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teachingDayId: uuid("teaching_day_id")
      .notNull()
      .references(() => teachingDays.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("unique_day_student_attendance").on(table.teachingDayId, table.studentId),
    index("idx_attendance_student").on(table.studentId),
  ]
);

// ── Workspace Activities ───────────────────────────────────────────────────────
export const workspaceActivities = pgTable(
  "workspace_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    examId: uuid("exam_id").references(() => exams.id, { onDelete: "cascade" }),
    teachingDayId: uuid("teaching_day_id").references(() => teachingDays.id, {
      onDelete: "set null",
    }),
    activityType: activityTypeEnum("activity_type").notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("unique_workspace_exam").on(table.workspaceId, table.examId),
    index("idx_activities_workspace").on(table.workspaceId),
  ]
);

// ── Workspace Class Reports ────────────────────────────────────────────────────
export const workspaceClassReports = pgTable(
  "workspace_class_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    totalScheduledDays: integer("total_scheduled_days").notNull().default(0),
    totalConductedDays: integer("total_conducted_days").notNull().default(0),
    reportData: json("report_data"),
  },
  (table) => [index("idx_reports_workspace").on(table.workspaceId)]
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
  autoSaveInterval: integer("auto_save_interval").notNull().default(15),
  executionMode: varchar("execution_mode", { length: 30 }).notNull().default("LOCAL_FALLBACK"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
