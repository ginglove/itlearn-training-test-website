# RSD New Feature Requirements
## Workspace (Class) Management System
**Based on:** RSD v7.3  
**Update Date:** 2026-07-01  
**Scope:** New Workspace module — Class management, Timetable, Roll Call, Activity Assignment, End-of-class Report

---

## 1. Feature Overview

A **Workspace** is a persistent virtual classroom created and managed by a Teacher. It groups a cohort of students, owns a structured timetable of teaching days, tracks daily attendance, hosts all activity types (Exercise, Homework, Assessment, Quiz), and produces an end-of-class summary report. The existing Exam/Quiz engine (Sections 3–9 of the base RSD) operates unchanged but can now be scoped to a specific Workspace.

---

## 2. Role & Permission Extensions

Extend the Permission Matrix (base RSD Section 2.3) with the following rows:

| System Module & Action | Teacher (Evaluator) | Student (Candidate) |
| :--- | :---: | :---: |
| **7. Workspace Management** | | |
| Create / Edit / Delete Workspace | ✅ | ❌ |
| Archive Workspace (end of class) | ✅ | ❌ |
| View Workspace detail | ✅ | 👤 *(member only)* |
| Add / Remove Students from Workspace | ✅ | ❌ |
| **8. Timetable** | | |
| Create / Edit / Delete Timetable | ✅ | ❌ |
| View Timetable | ✅ | 👤 *(member only)* |
| **9. Roll Call** | | |
| Conduct Roll Call per Teaching Day | ✅ | ❌ |
| View own attendance record | ❌ | 👤 |
| View all attendance records | ✅ | ❌ |
| **10. Workspace Activities** | | |
| Assign Exercise / Homework / Assessment / Quiz to Workspace | ✅ | ❌ |
| Attempt assigned activities | ❌ | 👤 *(member only)* |
| View activity results | ✅ | 👤 *(own only)* |
| **11. End-of-Class Report** | | |
| Generate / Export Report | ✅ | ❌ |
| View own report summary | ❌ | 👤 |

---

## 3. Database Schema Extensions

### 3.1. New Tables

```text
+---------------------+         +----------------------------+         +-------------------------+
|     workspaces      |         |   workspace_memberships    |         |    teaching_days        |
+---------------------+         +----------------------------+         +-------------------------+
| PK id (UUID)        |<--------| FK workspace_id            |<--------| FK workspace_id         |
|    name             |         | FK student_id              |         | PK id (UUID)            |
|    description      |         |    joined_at               |         |    day_number (int)     |
| FK created_by       |         |    status (ACTIVE/REMOVED) |         |    scheduled_date       |
|    status           |         +----------------------------+         |    topic                |
|    (ACTIVE/ARCHIVED)|                                               |    notes                |
|    total_days (int) |                                               +-------------------------+
|    start_date       |                      |
|    end_date         |                      v
+---------------------+         +----------------------------+
                                |    attendance_records      |
                                +----------------------------+
                                | PK id (UUID)               |
                                | FK teaching_day_id         |
                                | FK student_id              |
                                |    status                  |
                                |    (PRESENT/ABSENT/LATE/   |
                                |     EXCUSED)               |
                                |    note                    |
                                |    recorded_at             |
                                +----------------------------+

+----------------------------+         +-----------------------------+
|   workspace_activities     |         |   workspace_class_reports   |
+----------------------------+         +-----------------------------+
| PK id (UUID)               |         | PK id (UUID)                |
| FK workspace_id            |         | FK workspace_id             |
| FK exam_id (nullable)      |         | FK generated_by             |
|    activity_type           |         |    generated_at             |
|    (EXERCISE/HOMEWORK/     |         |    total_scheduled_days     |
|     ASSESSMENT/QUIZ)       |         |    total_conducted_days     |
|    title                   |         |    report_data (JSONB)      |
|    description             |         +-----------------------------+
|    due_date (nullable)     |
|    assigned_at             |
|    teaching_day_id (FK,    |
|    nullable — links to a   |
|    specific teaching day)  |
+----------------------------+
```

### 3.2. New Enum Values

| Enum | New Values Added |
| :--- | :--- |
| `workspace_status` | `ACTIVE`, `ARCHIVED` |
| `membership_status` | `ACTIVE`, `REMOVED` |
| `attendance_status` | `PRESENT`, `ABSENT`, `LATE`, `EXCUSED` |
| `activity_type` | `EXERCISE`, `HOMEWORK`, `ASSESSMENT`, `QUIZ` |

### 3.3. Key Column Notes

| Table | Column | Note |
| :--- | :--- | :--- |
| `workspaces` | `total_days` | Teacher-defined total number of teaching days for the class. Editable until workspace is ARCHIVED. |
| `workspaces` | `status` | `ACTIVE` while the class is running. `ARCHIVED` after teacher closes the workspace; archived workspaces are read-only. |
| `teaching_days` | `day_number` | Sequential integer (1, 2, 3…) within the workspace. Must be unique per workspace. |
| `workspace_activities` | `exam_id` | Links to an existing `exams` record. `NULL` for activities not backed by the existing quiz/coding engine. |
| `workspace_activities` | `activity_type` | `QUIZ` and `ASSESSMENT` types **must** have a non-null `exam_id` (backed by existing exam engine). `EXERCISE` and `HOMEWORK` may optionally link to an exam or be standalone text-based tasks. |
| `workspace_class_reports` | `report_data` | JSONB blob containing per-student score summaries, attendance breakdown, and per-day activity results. Schema defined in Section 7.2. |

---

## 4. Workspace Lifecycle

```text
[Teacher creates Workspace]
        |
        v
   status = ACTIVE
        |
        |--- Teacher adds Students to membership
        |--- Teacher builds Timetable (teaching days)
        |--- Teacher assigns Activities to Workspace / Teaching Days
        |--- Teacher conducts Roll Call per Teaching Day
        |--- Students attempt assigned Activities
        |
        v
[Teacher archives Workspace]
        |
        v
   status = ARCHIVED  ──►  Teacher generates End-of-Class Report
                           (read-only; no further edits permitted)
```

**Constraints:**
- An `ARCHIVED` workspace is fully read-only. No new students, teaching days, roll calls, or activity assignments are permitted.
- A workspace cannot be deleted if it has any `workspace_memberships`, `teaching_days`, or `workspace_activities` records. It must be archived instead.
- Archiving is irreversible via the UI. An admin-level DB override is the only recovery path.

---

## 5. Timetable Management

### 5.1. Timetable Structure

Each Workspace has exactly one timetable, composed of ordered `teaching_days` records. The teacher defines:

| Field | Description |
| :--- | :--- |
| **Total Days** | The planned total number of teaching days (`workspaces.total_days`). Editable at any time while `ACTIVE`. Does not need to match the actual number of `teaching_days` rows created — it represents the planned schedule. |
| **Teaching Day entries** | Each row represents one class session: a `day_number`, `scheduled_date`, optional `topic`, and `notes`. |

### 5.2. Timetable Rules

1. `day_number` must be a positive integer, unique per workspace, and assigned sequentially. Gaps are not permitted (e.g. days 1, 2, 4 without a day 3 is invalid).
2. `scheduled_date` must be a calendar date (`DATE` type, no time component). Two teaching days in the same workspace may not share the same `scheduled_date`.
3. Editing a teaching day's `scheduled_date` after roll call has been recorded for that day is permitted, but the system must display a warning: *"Roll call records exist for this day. Changing the date does not alter existing attendance records."*
4. Teaching days cannot be deleted if attendance records exist for them. The teacher must first void all attendance records for that day before deletion.

---

## 6. Roll Call

### 6.1. Roll Call Behavior

- Roll call is conducted per `teaching_day`. A teacher opens the roll call view for a specific day and marks each enrolled student as `PRESENT`, `ABSENT`, `LATE`, or `EXCUSED`.
- Roll call can be submitted multiple times for the same day (teacher can correct mistakes). Each save overwrites the previous records for that day — **not** appended.
- Roll call is available for any `teaching_day` in an `ACTIVE` workspace. It is read-only once the workspace is `ARCHIVED`.

### 6.2. Quick Roll Call

The **Quick Roll Call** feature allows the teacher to mark all students `PRESENT` in a single action and then individually adjust exceptions. Behavior:

1. Teacher opens Quick Roll Call for a `teaching_day`.
2. System pre-fills all enrolled students as `PRESENT`.
3. Teacher changes individual statuses as needed (e.g. mark 2 students `ABSENT`).
4. Teacher submits — all records are saved atomically.

### 6.3. Attendance Status Definitions

| Status | Definition |
| :--- | :--- |
| `PRESENT` | Student attended the session. |
| `ABSENT` | Student did not attend and provided no excuse. |
| `LATE` | Student attended but arrived after the session start. Counts as attended for report purposes. |
| `EXCUSED` | Student did not attend but provided an accepted excuse. Counted separately in reports. |

### 6.4. Attendance Aggregation Rules (for Report)

- **Attended days** = count of `PRESENT` + `LATE` records per student.
- **Absent days** = count of `ABSENT` records.
- **Excused days** = count of `EXCUSED` records.
- **Attendance rate** = `attended_days / total_conducted_days × 100` (%).
- `total_conducted_days` = number of `teaching_days` rows that have at least one roll call record submitted.

---

## 7. Workspace Activities

### 7.1. Activity Types

| Type | Description | Backed by Exam Engine? |
| :--- | :--- | :---: |
| `QUIZ` | Multiple-choice or coding quiz from existing exam engine. | ✅ Required |
| `ASSESSMENT` | Formal graded assessment (mid-term, final). Uses exam engine with full proctoring (focus-loss policy, timer). | ✅ Required |
| `HOMEWORK` | Take-home coding or quiz task. May optionally link to exam engine or be a standalone description. | Optional |
| `EXERCISE` | In-class practice task. May optionally link to exam engine or be a standalone description. | Optional |

### 7.2. Activity Assignment Rules

1. An activity is assigned to a workspace and optionally linked to a specific `teaching_day` (e.g. an exercise done in class on Day 3).
2. An activity with `activity_type = QUIZ` or `ASSESSMENT` **must** reference a valid `exam_id`. The referenced exam must have been created by the same teacher.
3. `due_date` is optional. If set, the student workspace displays a countdown for the activity.
4. A single `exam_id` may be reused across multiple workspaces but not assigned more than once to the same workspace.
5. When a student attempts an activity backed by the exam engine, the existing exam flow applies in full (timer, auto-save, focus-loss policy, submission pipeline).
6. Removing an activity from a workspace is only permitted if no student submissions exist for that activity's linked exam within that workspace context.

### 7.3. Student View — Workspace Activity List

Students see their workspace's activity list grouped by type with the following per-activity fields:

| Field | Description |
| :--- | :--- |
| `title` | Activity title. |
| `type` | Badge: EXERCISE (teal) · HOMEWORK (purple) · ASSESSMENT (red) · QUIZ (blue). |
| `due_date` | Due date if set; otherwise "—". |
| `status` | `NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `PENDING` / `CANCELLED` — derived from submission state (same logic as base RSD Section 9 Rule 15 for exam-backed activities). |
| `score` | Score percentage if graded; otherwise "—". |

---

## 8. End-of-Class Report

### 8.1. Report Generation

- The teacher triggers report generation via `POST /api/v1/teacher/workspaces/:id/report`.
- The workspace must be `ARCHIVED` before a report can be generated.
- Multiple reports can be generated (e.g. to regenerate after a grade correction). Each generation creates a new `workspace_class_reports` record. The latest record is the canonical report.

### 8.2. Report Data Structure (`report_data` JSONB)

```json
{
  "workspaceId": "uuid",
  "workspaceName": "string",
  "totalScheduledDays": 20,
  "totalConductedDays": 18,
  "generatedAt": "ISO8601 timestamp",
  "students": [
    {
      "studentId": "uuid",
      "fullName": "string",
      "studentCode": "string",
      "attendance": {
        "presentDays": 15,
        "lateDays": 2,
        "absentDays": 1,
        "excusedDays": 0,
        "attendanceRate": 94.4
      },
      "activities": [
        {
          "activityId": "uuid",
          "title": "string",
          "type": "QUIZ | EXERCISE | HOMEWORK | ASSESSMENT",
          "submissionStatus": "SUBMITTED | PENDING | CANCELLED | NOT_STARTED",
          "scorePercentage": 85.0,
          "submittedAt": "ISO8601 timestamp or null"
        }
      ],
      "summary": {
        "totalActivities": 10,
        "submittedCount": 8,
        "averageScore": 76.5,
        "highestScore": 95.0,
        "lowestScore": 50.0
      }
    }
  ],
  "dailySummary": [
    {
      "teachingDayId": "uuid",
      "dayNumber": 1,
      "scheduledDate": "YYYY-MM-DD",
      "topic": "string",
      "presentCount": 28,
      "absentCount": 2,
      "lateCount": 1,
      "excusedCount": 0,
      "activitiesAssigned": ["activityId1", "activityId2"]
    }
  ]
}
```

### 8.3. Report Display Rules

1. Students are sorted alphabetically by `fullName` in the report.
2. `averageScore` is computed only from activities with `submissionStatus = SUBMITTED`. Unsubmitted activities are excluded from the average but counted in `totalActivities`.
3. If a student has no submitted activities, `averageScore` is displayed as `"—"` (not `0`).
4. `attendanceRate` is rounded to one decimal place.
5. The report is exportable as a `.xlsx` file. Each student occupies one row; columns mirror the `summary` and `attendance` fields.

---

## 9. REST API Endpoint Catalog — Workspace Extensions

### 9.1. Workspace Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET / POST | `/api/v1/teacher/workspaces` | List all workspaces / create a new workspace |
| GET / PUT | `/api/v1/teacher/workspaces/:id` | Get or update workspace details (name, description, total_days, dates) |
| POST | `/api/v1/teacher/workspaces/:id/archive` | Archive the workspace (irreversible). Validates no ACTIVE sessions exist. |
| GET / POST | `/api/v1/teacher/workspaces/:id/members` | List enrolled students / add students to workspace |
| DELETE | `/api/v1/teacher/workspaces/:id/members/:studentId` | Remove a student from the workspace (only if no submissions exist) |
| GET | `/api/v1/student/workspaces` | List workspaces the student is enrolled in |
| GET | `/api/v1/student/workspaces/:id` | Get workspace detail + activity list for the student |

### 9.2. Timetable Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/api/v1/teacher/workspaces/:id/timetable` | Get full timetable (all teaching days) |
| POST | `/api/v1/teacher/workspaces/:id/timetable` | Add a new teaching day |
| PUT | `/api/v1/teacher/workspaces/:id/timetable/:dayId` | Update a teaching day (date, topic, notes) |
| DELETE | `/api/v1/teacher/workspaces/:id/timetable/:dayId` | Delete a teaching day (blocked if attendance records exist) |
| GET | `/api/v1/student/workspaces/:id/timetable` | View timetable (read-only for students) |

### 9.3. Roll Call Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/api/v1/teacher/workspaces/:id/timetable/:dayId/rollcall` | Get current roll call records for a teaching day |
| POST / PUT | `/api/v1/teacher/workspaces/:id/timetable/:dayId/rollcall` | Submit or overwrite roll call for a teaching day (full list; atomic upsert) |
| GET | `/api/v1/teacher/workspaces/:id/attendance` | Get full attendance matrix (all students × all days) |
| GET | `/api/v1/student/workspaces/:id/attendance` | Get own attendance records |

### 9.4. Activity Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET / POST | `/api/v1/teacher/workspaces/:id/activities` | List / assign activities to workspace |
| PUT / DELETE | `/api/v1/teacher/workspaces/:id/activities/:activityId` | Update or remove an activity assignment |
| GET | `/api/v1/student/workspaces/:id/activities` | List all activities assigned to the student's workspace |

### 9.5. Report Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/api/v1/teacher/workspaces/:id/report` | Generate (or regenerate) end-of-class report |
| GET | `/api/v1/teacher/workspaces/:id/report` | Get the latest generated report |
| GET | `/api/v1/teacher/workspaces/:id/report/export` | Export latest report as `.xlsx` |
| GET | `/api/v1/student/workspaces/:id/report` | Get own summary section from the latest report (read-only, post-archive only) |

---

## 10. Behavioral Specifications — Workspace Module

**W1. Workspace Isolation:** Exams and activities assigned to a workspace are only accessible to enrolled members of that workspace, regardless of the exam's global `access_type` setting.

**W2. Student Removal Guard:** A student cannot be removed from a workspace if they have any `exam_submissions` records linked to activities within that workspace. The teacher must void or migrate those records first.

**W3. Timetable Day Number Integrity:** If a teaching day is deleted and its `day_number` creates a gap, the system must automatically re-sequence all subsequent day numbers to close the gap. This re-sequencing must occur atomically.

**W4. Roll Call Atomicity:** The `POST /PUT rollcall` endpoint must save all student attendance statuses for the given teaching day in a single transaction. Partial saves are not permitted. If any record fails validation, the entire upsert is rolled back and a `ROLLCALL_SAVE_FAILED` error is returned.

**W5. Quick Roll Call Default:** When the teacher initiates Quick Roll Call, the system pre-populates all enrolled students with `PRESENT`. Only students with `membership_status = ACTIVE` at the time of roll call are included.

**W6. Activity Score Source:** For exam-backed activities (`QUIZ`, `ASSESSMENT`), the score displayed in the workspace activity list and report is sourced directly from `exam_submissions.score` (the auto-graded result from the existing grading pipeline). Manual score overrides are not supported in this version.

**W7. Report Snapshot:** The report is a point-in-time snapshot generated at the moment of the `POST /report` call. Subsequent changes to attendance records or submission scores do not automatically update an existing report. The teacher must regenerate to reflect changes.

**W8. Archive Pre-check:** Before archiving a workspace, the system must verify:
1. No student has an `IN_PROGRESS` exam submission for any activity in this workspace.
2. All teaching days with a `scheduled_date ≤ TODAY` have at least one roll call record submitted. If either condition fails, the archive request is rejected with a detailed error listing the blocking items.

**W9. Student Report Visibility:** A student can only view their own section of the end-of-class report. The report endpoint for students (`GET /api/v1/student/workspaces/:id/report`) returns only that student's `attendance`, `activities`, and `summary` objects — never other students' data.

**W10. Workspace Status Display (Student):** On the student's workspace list, each workspace displays:
- `ACTIVE` — Green badge. Student can access activities and timetable.
- `ARCHIVED` — Grey badge. Read-only. Student can view results and report summary.

---

## 11. Error Code Extensions

Append the following rows to the Error Code Reference (base RSD Section 8.6):

| Error Code | HTTP Status | Trigger Condition |
| :--- | :---: | :--- |
| `WORKSPACE_NOT_FOUND` | 404 | No workspace with the given `:id` exists or is accessible to the requester. |
| `WORKSPACE_ARCHIVED` | 409 | Mutation attempted on an `ARCHIVED` workspace (add member, edit timetable, roll call, assign activity). |
| `WORKSPACE_ARCHIVE_BLOCKED` | 409 | Archive attempted but pre-check failed (active submissions or missing roll call days). Response body lists blocking items. |
| `STUDENT_NOT_MEMBER` | 403 | Student attempted to access a workspace they are not enrolled in. |
| `DUPLICATE_TEACHING_DAY_DATE` | 409 | Two teaching days in the same workspace share the same `scheduled_date`. |
| `TEACHING_DAY_HAS_ATTENDANCE` | 409 | Delete attempted on a teaching day that has existing roll call records. |
| `ACTIVITY_HAS_SUBMISSIONS` | 409 | Remove-activity attempted but students have already submitted for that activity. |
| `REPORT_NOT_GENERATED` | 404 | GET report called but no report has been generated yet for this workspace. |
| `ROLLCALL_SAVE_FAILED` | 500 | Atomic roll call upsert failed mid-transaction. All records rolled back. |
| `DUPLICATE_EXAM_IN_WORKSPACE` | 409 | The same `exam_id` is assigned to the same workspace more than once. |
| `MEMBER_HAS_SUBMISSIONS` | 409 | Remove-member attempted but the student has submission records in this workspace. |
| `WORKSPACE_REPORT_NOT_ARCHIVED` | 400 | Report generation attempted before workspace is `ARCHIVED`. |

---

*END OF WORKSPACE MODULE REQUIREMENTS — v1.0, 2026-07-01*
