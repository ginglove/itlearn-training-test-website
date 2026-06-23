CREATE TYPE "public"."execution_status" AS ENUM('AC', 'WA', 'CE', 'RE', 'TLE');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('QUIZ', 'CODE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('TEACHER', 'STUDENT');--> statement-breakpoint
CREATE TABLE "code_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"time_limit" integer DEFAULT 1000 NOT NULL,
	"memory_limit" integer DEFAULT 65536 NOT NULL,
	CONSTRAINT "code_configs_question_id_unique" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "exam_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"total_score" numeric(5, 2) DEFAULT '0.00',
	"client_ip" varchar(45) NOT NULL,
	"focus_loss_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_shuffled" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"title" varchar(150) NOT NULL,
	"content" text NOT NULL,
	"points" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"input_data" text NOT NULL,
	"output_data" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "code_configs" ADD CONSTRAINT "code_configs_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_details" ADD CONSTRAINT "submission_details_submission_id_exam_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."exam_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_details" ADD CONSTRAINT "submission_details_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_submission_per_student_exam" ON "exam_submissions" USING btree ("exam_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_lookup" ON "exam_submissions" USING btree ("exam_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_exams_dates" ON "exams" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "idx_questions_exam_id" ON "questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_quiz_options_question_id" ON "quiz_options" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_question_per_submission" ON "submission_details" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_submission_details_lookup" ON "submission_details" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_test_cases_question_id" ON "test_cases" USING btree ("question_id");