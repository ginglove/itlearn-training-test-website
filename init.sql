-- Clean up existing tables and types
DROP TABLE IF EXISTS "workspace_class_reports" CASCADE;
DROP TABLE IF EXISTS "workspace_activity_attempts" CASCADE;
DROP TABLE IF EXISTS "workspace_activities" CASCADE;
DROP TABLE IF EXISTS "attendance_records" CASCADE;
DROP TABLE IF EXISTS "teaching_days" CASCADE;
DROP TABLE IF EXISTS "workspace_memberships" CASCADE;
DROP TABLE IF EXISTS "workspace_teachers" CASCADE;
DROP TABLE IF EXISTS "workspaces" CASCADE;
DROP TABLE IF EXISTS "xpath_configs" CASCADE;
DROP TABLE IF EXISTS "xpath_test_cases" CASCADE;
DROP TABLE IF EXISTS "code_configs" CASCADE;
DROP TABLE IF EXISTS "exam_submissions" CASCADE;
DROP TABLE IF EXISTS "exam_assignments" CASCADE;
DROP TABLE IF EXISTS "exams" CASCADE;
DROP TABLE IF EXISTS "questions" CASCADE;
DROP TABLE IF EXISTS "quiz_options" CASCADE;
DROP TABLE IF EXISTS "submission_details" CASCADE;
DROP TABLE IF EXISTS "test_cases" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "platform_settings" CASCADE;

DROP TYPE IF EXISTS "public"."execution_status" CASCADE;
DROP TYPE IF EXISTS "public"."question_type" CASCADE;
DROP TYPE IF EXISTS "public"."user_role" CASCADE;
DROP TYPE IF EXISTS "public"."workspace_status" CASCADE;
DROP TYPE IF EXISTS "public"."membership_status" CASCADE;
DROP TYPE IF EXISTS "public"."attendance_status" CASCADE;
DROP TYPE IF EXISTS "public"."activity_type" CASCADE;

-- Enums
CREATE TYPE "public"."execution_status" AS ENUM('AC', 'WA', 'CE', 'RE', 'TLE', 'OFE');
CREATE TYPE "public"."question_type" AS ENUM('QUIZ', 'CODE', 'XPATH');
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'TEACHER', 'STUDENT');
CREATE TYPE "public"."workspace_status" AS ENUM('ACTIVE', 'ARCHIVED');
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'REMOVED');
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "public"."activity_type" AS ENUM('EXERCISE', 'HOMEWORK', 'ASSESSMENT', 'QUIZ');

-- Tables
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'STUDENT' NOT NULL,
	"is_first_login" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_shuffled" boolean DEFAULT false NOT NULL,
	"allowed_attempts" integer DEFAULT 1 NOT NULL,
	"access_type" varchar(20) DEFAULT 'ALL' NOT NULL,
	"session_type" varchar(20) DEFAULT 'QUIZ' NOT NULL,
	"focus_loss_policy" varchar(20) DEFAULT 'LOG_ONLY' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"title" varchar(150) NOT NULL,
	"content" text NOT NULL,
	"points" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "quiz_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);

CREATE TABLE "code_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"time_limit" integer DEFAULT 1000 NOT NULL,
	"memory_limit" integer DEFAULT 65536 NOT NULL,
	"starter_code" text,
	"teacher_code" text,
	CONSTRAINT "code_configs_question_id_unique" UNIQUE("question_id")
);

CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"input_data" text NOT NULL,
	"output_data" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);

CREATE TABLE "exam_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_order" json,
	"submitted_at" timestamp with time zone,
	"total_score" numeric(5, 2) DEFAULT '0.00',
	"client_ip" varchar(45) NOT NULL,
	"focus_loss_count" integer DEFAULT 0 NOT NULL,
	"close_reason" varchar(50),
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"active_seconds_updated_at" timestamp with time zone,
	"attempt" integer DEFAULT 1 NOT NULL
);

CREATE TABLE "submission_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_options" text[] DEFAULT '{}',
	"source_code" text,
	"language" varchar(30),
	"status" "execution_status",
	"student_xpath" text,
	"score" numeric(5, 2) DEFAULT '0.00' NOT NULL
);

CREATE TABLE "xpath_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"selector_type" varchar(10) DEFAULT 'XPATH' NOT NULL,
	CONSTRAINT "xpath_configs_question_id_unique" UNIQUE("question_id")
);

CREATE TABLE "xpath_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"target_type" varchar(10) DEFAULT 'HTML' NOT NULL,
	"selector_type" varchar(10) DEFAULT 'XPATH' NOT NULL,
	"target_payload" text NOT NULL,
	"reference_selector" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);

CREATE TABLE "exam_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL
);

-- Foreign Keys
ALTER TABLE "code_configs" ADD CONSTRAINT "code_configs_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "submission_details" ADD CONSTRAINT "submission_details_submission_id_exam_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."exam_submissions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "submission_details" ADD CONSTRAINT "submission_details_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "xpath_configs" ADD CONSTRAINT "xpath_configs_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "xpath_test_cases" ADD CONSTRAINT "xpath_test_cases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE UNIQUE INDEX "one_submission_per_student_exam_attempt" ON "exam_submissions" USING btree ("exam_id","student_id","attempt");
CREATE INDEX "idx_submissions_lookup" ON "exam_submissions" USING btree ("exam_id","student_id");
CREATE INDEX "idx_exams_dates" ON "exams" USING btree ("start_time","end_time");
CREATE INDEX "idx_questions_exam_id" ON "questions" USING btree ("exam_id");
CREATE INDEX "idx_quiz_options_question_id" ON "quiz_options" USING btree ("question_id");
CREATE UNIQUE INDEX "unique_question_per_submission" ON "submission_details" USING btree ("submission_id","question_id");
CREATE INDEX "idx_submission_details_lookup" ON "submission_details" USING btree ("submission_id");
CREATE INDEX "idx_test_cases_question_id" ON "test_cases" USING btree ("question_id");
CREATE UNIQUE INDEX "unique_exam_student_assignment" ON "exam_assignments" USING btree ("exam_id","student_id");
CREATE INDEX "idx_exam_assignments_lookup" ON "exam_assignments" USING btree ("exam_id");
CREATE INDEX "idx_xpath_test_cases_question_id" ON "xpath_test_cases" USING btree ("question_id");

CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"piston_api_url" varchar(255) DEFAULT 'https://emkc.org/api/v2/piston' NOT NULL,
	"queue_backend" varchar(100) DEFAULT 'Upstash Redis' NOT NULL,
	"session_type" varchar(100) DEFAULT 'JWT (HTTP-only Cookie)' NOT NULL,
	"ip_binding" boolean DEFAULT true NOT NULL,
	"password_reset_enforced" boolean DEFAULT true NOT NULL,
	"focus_tracking_enabled" boolean DEFAULT true NOT NULL,
	"auto_save_interval" integer DEFAULT 15 NOT NULL,
	"execution_mode" varchar(30) DEFAULT 'LOCAL_FALLBACK' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "platform_settings" ("piston_api_url", "queue_backend", "session_type", "ip_binding", "password_reset_enforced", "focus_tracking_enabled", "auto_save_interval", "execution_mode")
VALUES ('https://emkc.org/api/v2/piston', 'Upstash Redis', 'JWT (HTTP-only Cookie)', true, true, true, 15, 'LOCAL_FALLBACK');

-- ── Workspace (Class) Management Module — RSD v9 ───────────────────────────────

CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"status" "workspace_status" DEFAULT 'ACTIVE' NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "teaching_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"topic" varchar(200),
	"notes" text
);

CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teaching_day_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"exam_id" uuid,
	"teaching_day_id" uuid,
	"activity_type" "activity_type" NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_activity_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"text_response" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score_percentage" numeric(5, 2)
);

CREATE TABLE "workspace_class_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_scheduled_days" integer DEFAULT 0 NOT NULL,
	"total_conducted_days" integer DEFAULT 0 NOT NULL,
	"report_data" json
);

-- Workspace Foreign Keys
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_teachers" ADD CONSTRAINT "workspace_teachers_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_teachers" ADD CONSTRAINT "workspace_teachers_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "teaching_days" ADD CONSTRAINT "teaching_days_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_teaching_day_id_fk" FOREIGN KEY ("teaching_day_id") REFERENCES "public"."teaching_days"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_teaching_day_id_fk" FOREIGN KEY ("teaching_day_id") REFERENCES "public"."teaching_days"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "workspace_activity_attempts" ADD CONSTRAINT "activity_attempts_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."workspace_activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_activity_attempts" ADD CONSTRAINT "activity_attempts_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_class_reports" ADD CONSTRAINT "workspace_class_reports_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_class_reports" ADD CONSTRAINT "workspace_class_reports_generated_by_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Workspace Indexes
CREATE INDEX "idx_workspaces_created_by" ON "workspaces" USING btree ("created_by");
CREATE UNIQUE INDEX "unique_workspace_teacher" ON "workspace_teachers" USING btree ("workspace_id","teacher_id");
CREATE INDEX "idx_workspace_teachers_teacher" ON "workspace_teachers" USING btree ("teacher_id");
CREATE UNIQUE INDEX "unique_workspace_student" ON "workspace_memberships" USING btree ("workspace_id","student_id");
CREATE INDEX "idx_memberships_workspace" ON "workspace_memberships" USING btree ("workspace_id");
CREATE INDEX "idx_workspace_memberships_student" ON "workspace_memberships" USING btree ("student_id");
CREATE UNIQUE INDEX "unique_workspace_day_number" ON "teaching_days" USING btree ("workspace_id","day_number");
CREATE UNIQUE INDEX "unique_workspace_day_date" ON "teaching_days" USING btree ("workspace_id","scheduled_date");
CREATE UNIQUE INDEX "unique_day_student_attendance" ON "attendance_records" USING btree ("teaching_day_id","student_id");
CREATE INDEX "idx_attendance_student" ON "attendance_records" USING btree ("student_id");
CREATE UNIQUE INDEX "unique_workspace_exam" ON "workspace_activities" USING btree ("workspace_id","exam_id");
CREATE INDEX "idx_activities_workspace" ON "workspace_activities" USING btree ("workspace_id");
CREATE INDEX "idx_workspace_activities_exam" ON "workspace_activities" USING btree ("exam_id");
CREATE UNIQUE INDEX "unique_activity_student_attempt" ON "workspace_activity_attempts" USING btree ("activity_id","student_id");
CREATE INDEX "idx_activity_attempts_student" ON "workspace_activity_attempts" USING btree ("student_id");
CREATE INDEX "idx_reports_workspace" ON "workspace_class_reports" USING btree ("workspace_id");

-- ── Seed: platform admin account ───────────────────────────────────────────────
-- Login: platform_admin / Admin@123!  (change the password after first login)
INSERT INTO "users" ("id", "username", "password_hash", "full_name", "email", "role", "is_first_login")
VALUES (
	'00000000-0000-0000-0000-000000000003',
	'platform_admin',
	'$2b$10$mdXCThX1wqNBxZuQvuOUbuvxNu1poz2uUEmnUKuA36o8J2o2qqTKu',
	'Platform Admin',
	'admin@example.com',
	'ADMIN',
	false
)
ON CONFLICT ("username") DO NOTHING;

