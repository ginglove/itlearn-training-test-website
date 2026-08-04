CREATE TYPE "public"."activity_type" AS ENUM('EXERCISE', 'HOMEWORK', 'ASSESSMENT', 'QUIZ');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'TEXT';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'ADMIN' BEFORE 'TEACHER';--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teaching_day_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"selected_options" text[] DEFAULT '{}',
	"text_answer" text,
	"is_correct" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"time_taken_ms" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"total_time_ms" bigint DEFAULT 0 NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"workspace_id" uuid,
	"join_code" varchar(8) NOT NULL,
	"status" varchar(12) DEFAULT 'LOBBY' NOT NULL,
	"current_question_index" integer DEFAULT -1 NOT NULL,
	"question_started_at" timestamp with time zone,
	"question_seconds" integer DEFAULT 30 NOT NULL,
	"mode" varchar(10) DEFAULT 'TEACHER' NOT NULL,
	"show_correct_answer" boolean DEFAULT true NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"question_order" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"topic" varchar(200),
	"notes" text,
	"teacher_absent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "workspace_activity_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"text_response" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score_percentage" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "workspace_class_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_scheduled_days" integer DEFAULT 0 NOT NULL,
	"total_conducted_days" integer DEFAULT 0 NOT NULL,
	"report_data" json
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"status" "workspace_status" DEFAULT 'ACTIVE' NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"schedule_days" integer[],
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD COLUMN "active_seconds_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "focus_loss_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_details" ADD COLUMN "text_answer" text;--> statement-breakpoint
ALTER TABLE "submission_details" ADD COLUMN "graded_by" uuid;--> statement-breakpoint
ALTER TABLE "submission_details" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_teaching_day_id_teaching_days_id_fk" FOREIGN KEY ("teaching_day_id") REFERENCES "public"."teaching_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answers" ADD CONSTRAINT "live_answers_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_days" ADD CONSTRAINT "teaching_days_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activities" ADD CONSTRAINT "workspace_activities_teaching_day_id_teaching_days_id_fk" FOREIGN KEY ("teaching_day_id") REFERENCES "public"."teaching_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activity_attempts" ADD CONSTRAINT "workspace_activity_attempts_activity_id_workspace_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."workspace_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activity_attempts" ADD CONSTRAINT "workspace_activity_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_class_reports" ADD CONSTRAINT "workspace_class_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_class_reports" ADD CONSTRAINT "workspace_class_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teachers" ADD CONSTRAINT "workspace_teachers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teachers" ADD CONSTRAINT "workspace_teachers_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_day_student_attendance" ON "attendance_records" USING btree ("teaching_day_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_student" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_live_answer" ON "live_answers" USING btree ("session_id","question_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_live_answers_session_question" ON "live_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_live_participant" ON "live_participants" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_live_participants_session" ON "live_participants" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_live_join_code" ON "live_sessions" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_host" ON "live_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_workspace_day_number" ON "teaching_days" USING btree ("workspace_id","day_number");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_workspace_day_date" ON "teaching_days" USING btree ("workspace_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_workspace_exam" ON "workspace_activities" USING btree ("workspace_id","exam_id");--> statement-breakpoint
CREATE INDEX "idx_activities_workspace" ON "workspace_activities" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_activity_student_attempt" ON "workspace_activity_attempts" USING btree ("activity_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_activity_attempts_student" ON "workspace_activity_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_reports_workspace" ON "workspace_class_reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_workspace_student" ON "workspace_memberships" USING btree ("workspace_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_workspace" ON "workspace_memberships" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_workspace_teacher" ON "workspace_teachers" USING btree ("workspace_id","teacher_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_teachers_teacher" ON "workspace_teachers" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_workspaces_created_by" ON "workspaces" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "submission_details" ADD CONSTRAINT "submission_details_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;