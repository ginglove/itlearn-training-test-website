-- Clean up existing tables and types
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

-- Enums
CREATE TYPE "public"."execution_status" AS ENUM('AC', 'WA', 'CE', 'RE', 'TLE');
CREATE TYPE "public"."question_type" AS ENUM('QUIZ', 'CODE');
CREATE TYPE "public"."user_role" AS ENUM('TEACHER', 'STUDENT');

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
	"score" numeric(5, 2) DEFAULT '0.00' NOT NULL
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

