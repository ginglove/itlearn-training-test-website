-- Migration 0014: resync existing exam-backed activity types from the exam's
-- session type (Quiz Session→QUIZ, Final Exam→ASSESSMENT, Practice→EXERCISE,
-- Homework→HOMEWORK). New assignments already derive the type automatically.
UPDATE "workspace_activities" wa
SET "activity_type" = CASE e."session_type"
  WHEN 'FINAL' THEN 'ASSESSMENT'::"activity_type"
  WHEN 'PRACTICE' THEN 'EXERCISE'::"activity_type"
  WHEN 'HOMEWORK' THEN 'HOMEWORK'::"activity_type"
  ELSE 'QUIZ'::"activity_type"
END
FROM "exams" e
WHERE wa."exam_id" = e."id";
