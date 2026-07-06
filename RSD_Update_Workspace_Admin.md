```markdown
# Requirements Specification Document (RSD)
## Enterprise Online Quiz, Hybrid Coding & Class Workspace Governance Platform
**Document Version:** 9.2 (Unified Core Engine, Multi-Tier Admin Governance & Workspace Management Module)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

---

## Revision History

### Version 9.2 — 2026-07-05
*   **Strict Role Boundary Enforcement:** Platform Settings mutation is now Admin-only (the read endpoint remains available to all authenticated roles for exam workspace configuration). The teacher panel no longer exposes Platform Settings. Workspace creation is Admin-only; the teacher creation endpoint is removed and teachers operate exclusively on workspaces assigned via `workspace_teachers`.
*   **Admin Operational Parity:** Admins gain full, globally-scoped access to exam management (list, create, edit, delete, questions, clone, regrade, force-submit), the daily Session Monitor, the live SSE exam monitor, and all workspace operations (members, activities, timetable, roll call, attendance, reports) in any workspace.
*   **Teacher Scoping:** Teacher student management, the Session Monitor, and the live exam monitor are restricted to students enrolled (ACTIVE membership) in the teacher's assigned workspaces. A minimal global student directory (`?scope=all`) exists solely for workspace enrollment.
*   **Admin Account & User Administration:** Admin Settings page (own profile edit + password change with complexity policy), plus teacher administration actions: edit profile, issue temporary password reset, and delete (blocked while exams or assignments exist).
*   **Bulk Workspace Operations:** Multi-select add/remove of students and multi-select assign/remove of exams (activities) with per-item skip reporting for guarded records.
*   **Security Hardening (from the v9.1 technical review):** server-synchronized focus-loss counter (reload-proof), `active_seconds` anti-tamper heartbeat clamp, standalone activity submissions table (`workspace_activity_attempts`) with teacher grading, and SSRF DNS-rebinding/redirect/content-type hardening for XPath URL fetches.

### Version 9.1 — 2026-07-02
*   **Admin Dashboard Metrics Integration:** Introduces a formal admin overview subsystem mapping global counters for active students, active teachers, active workspaces, total exams, and total questions.
*   **Unified Merger:** Fully integrates core exam system specifications (v7.3), updated telemetry/timer adjustments, workspace module requirements, multi-tier administrator governance, and planned architectural optimizations into a single cohesive specifications blueprint.
*   **Incorporation of Updated Core Requirements:** Integrates the 10 priority corrections from the v7.3 review, including the strict 4-state `submissionStatus` priority algorithm, re-entry transactional atomicity, timer floors, focus-loss load guards, custom exit endpoint contracts, CSS vs. XPath matching distinctions, force-submit lifecycle rules, local fallback overrides, and a standardized API error envelope.
*   **Enterprise Administration:** Formally defines the three-tier access matrix (Admin, Teacher, Student) and isolates classroom workspaces, class reports, and teacher workloads to their respective assignments.

---

## 1. System Overview & Architecture Scope

### 1.1. Purpose
The platform is a unified online assessment and learning environment. It integrates automated theoretical evaluation (Quizzes), practical compiler evaluation (Coding tasks), and browser automation simulation (XPath & CSS selectors) with a persistent classroom administration layer (Workspaces). This dual design enables administrators and instructors to manage course cohorts, schedule timetables, automate daily attendance, assign homework/exams, and generate authenticated end-of-class analytical reports.

### 1.2. Architecture Diagram

```text
+---------------------------------------------------------------------------------+
|                                 FRONTEND CLIENT                                 |
|                   React.js / Next.js SPA (TypeScript & Tailwind)                |
+---------------------------------------------------------------------------------+
                                         |
                                         | HTTPS / Server-Sent Events (SSE)
                                         v
+---------------------------------------------------------------------------------+
|                         NEXT.JS API ROUTES (Edge/Node Runtime)                  |
|              /api/v1/admin/**, /api/v1/teacher/**, /api/v1/student/**           |
+---------------------------------------------------------------------------------+
          |                      |                       |                    |
          v                      v                       v                    v
+--------------------+  +--------------------+  +-------------------+  +-----------------------+
| PRIMARY DATASTORE  |  |   CODE EXECUTION   |  | XPATH EVALUATION  |  |  INTERNAL WORKERS     |
| Neon PostgreSQL    |  |   Piston API /     |  | Shared JSDOM      |  |  /api/v1/internal/    |
| (Drizzle ORM)      |  |   Local Fallback   |  | Engine (Backend)  |  |  execute-code         |
+--------------------+  +--------------------+  +-------------------+  +-----------------------+
```

---

## 2. User Roles, Multi-Tier Governance & Access Matrix

### 2.1. Role Definitions
*   **Admin (Super-User):** Full platform access. Responsible for the system-wide lifecycle of workspaces, user registrations, assigning teachers to classrooms, restoring archived data, and monitoring global analytical metrics via the Admin Dashboard.
*   **Teacher (Evaluator):** Manages specific student cohorts. Can configure timetables, take attendance, assign quizzes/exams, view real-time workspace monitors, and generate end-of-class class reports *only* within the workspaces assigned to them by an Admin.
*   **Student (Candidate):** Participates in classes and attempts activities (homework, exams, quizzes) assigned within their active workspaces. Authenticates via provisioned credentials.

### 2.2. Enrollment & First-Time Password Reset Lifecycle
Self-registration is disabled. Account provisioning is restricted to admin upload processes or instructor operations within assigned workspaces.

1.  **Account Seeding:** Accounts are created by uploading a structured dataset (`student_id`, `full_name`, `email`).
2.  **Access Interception:** Upon initial authentication via `/api/v1/auth/login`, if the account’s `is_first_login` is `true`, the API returns a `403 Forbidden` with the error code `FORCE_PASSWORD_RESET_REQUIRED`.
3.  **Password Verification:** The system blocks further interaction until the user updates their password. The new password must contain at least 8 characters, including at least one uppercase letter, one lowercase letter, one numeric digit, and one special character. Upon successful update, the system writes the password hash, sets `is_first_login` to `false`, and permits entry.

### 2.3. Consolidated Access Control Matrix

**Legend:** ✅ Full Access · ❌ No Access · 👤 Self/Assigned Scope Only

| Functional Action | Admin | Teacher | Student |
| :--- | :---: | :---: | :---: |
| **Identity & Platform Accounts** | | | |
| Create / Edit / Deactivate Admin or Teacher | ✅ | ❌ | ❌ |
| Create / Edit / Import Students | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| View Student enrollment metrics across workspaces | ✅ | ❌ | ❌ |
| View Teacher workload metrics | ✅ | 👤 *(Own only)* | ❌ |
| Configure Platform Settings (execution, security, auto-save) | ✅ | ❌ | ❌ |
| Edit own profile / change own password | ✅ | 👤 | 👤 |
| Reset another user's password | ✅ | 👤 *(Students in assigned workspaces)* | ❌ |
| **Workspace Governance** | | | |
| Create / Delete Workspaces | ✅ | ❌ | ❌ |
| Assign / Remove Teachers to Workspaces | ✅ | ❌ | ❌ |
| Add / Remove Students to Workspaces | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Archive Workspace (Read-only lock) | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Un-Archive Workspace (Admin Override) | ✅ | ❌ | ❌ |
| **Timetable & Attendance (Classroom)** | | | |
| Create / Edit / Delete Timetable Days | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Conduct Roll Call (Individual / Quick Roll Call) | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| View own attendance records | ❌ | ❌ | 👤 |
| View all workspace attendance matrices | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| **Activity & Exam Operations** | | | |
| Create / Edit / Delete / Clone Exams | ✅ *(All exams)* | 👤 *(Own exams)* | ❌ |
| Monitor live exam sessions & daily session archive | ✅ *(All students)* | 👤 *(Students in assigned workspaces)* | ❌ |
| Assign Quiz / Exercise / Homework / Assessment (single or bulk) | ✅ *(Any workspace)* | 👤 *(Assigned Workspaces)* | ❌ |
| Grade standalone activity attempts | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Force-Submit Active / Pending Student Exams | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Attempt Assigned Activities | ❌ | ❌ | 👤 *(Enrolled Members)* |
| View activity results | ✅ | 👤 *(Assigned Workspaces)* | 👤 *(Own only)* |
| **End-of-Class Reports** | | | |
| Generate / Regenerate End-of-Class Report | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| Export class reports to `.xlsx` | ✅ | 👤 *(Assigned Workspaces)* | ❌ |
| View own summary page | ❌ | ❌ | 👤 *(Post-archive only)* |

---

## 3. Database Schema Extensions

### 3.1. Unified Database Schema Map

```text
  +------------------+         +----------------------------+         +---------------------+
  |      users       |         |   workspace_teachers       |         |     workspaces      |
  +------------------+         +----------------------------+         +---------------------+
  | PK id (UUID)     |<--------| FK teacher_id              |         | PK id (UUID)        |
  |    username      |         | FK workspace_id            |-------->|    name             |
  |    role (Enum)   |         |    assigned_at             |         |    description      |
  +------------------+         +----------------------------+         | FK created_by       |
                                                                      |    status (Enum)    |
                                                                      |    total_days (int) |
  +------------------+         +----------------------------+         |    start_date       |
  |   admin_stats    |         |   workspace_memberships    |         |    end_date         |
  |   (Virtual/View) |         +----------------------------+         +---------------------+
  +------------------+         | FK student_id              |                    |
                               | FK workspace_id            |                    |
                               |    joined_at               |                    v
                               |    status (Enum)           |         +-------------------------+
                               +----------------------------+         |    teaching_days        |
                                            |                         +-------------------------+
                                            v                         | FK workspace_id         |
                               +----------------------------+         | PK id (UUID)            |
                               |    attendance_records      |         |    day_number (int)     |
                               +----------------------------+         |    scheduled_date       |
                               | PK id (UUID)               |         |    topic                |
                               | FK teaching_day_id         |<--------|    notes                |
                               | FK student_id              |         +-------------------------+
                               |    status (Enum)           |
                               |    note                    |
                               |    recorded_at             |
                               +----------------------------+

  +----------------------------+         +-----------------------------+
  |   workspace_activities     |         |   workspace_class_reports   |
  +----------------------------+         +-----------------------------+
  | PK id (UUID)               |         | PK id (UUID)                |
  | FK workspace_id            |         | FK workspace_id             |
  | FK exam_id (nullable)      |         | FK generated_by             |
  |    activity_type (Enum)    |         |    generated_at             |
  |    title                   |         |    total_scheduled_days     |
  |    description             |         |    total_conducted_days     |
  |    due_date (nullable)     |         |    report_data (JSONB)      |
  |    assigned_at             |         +-----------------------------+
  |    teaching_day_id (FK,    |
  |    nullable)               |
  +----------------------------+

  +----------------------------+         +-----------------------------+
  |           exams            |         |      exam_submissions       |
  +----------------------------+         +-----------------------------+
  | PK id (UUID)               |         | PK id (UUID)                |
  |    title                   |         | FK exam_id                  |
  |    duration                |         | FK student_id               |
  |    focus_loss_policy       |         | FK workspace_id (nullable)  |
  |    access_type             |         |    start_at                 |
  |    created_by              |         |    submitted_at             |
  |    end_time                |         |    focus_loss_count         |
  +----------------------------+         |    close_reason             |
                                         |    active_seconds           |
                                         +-----------------------------+
```

### 3.1.b. v9.2 Schema Additions

```text
  +------------------------------------+       exam_submissions (extended):
  |    workspace_activity_attempts     |       +  active_seconds_updated_at
  +------------------------------------+          (timestamptz, heartbeat for
  | PK id (UUID)                       |           server-side active-time
  | FK activity_id                     |           verification)
  | FK student_id                      |
  |    text_response (Text)            |
  |    submitted_at (Timestamp)        |
  |    score_percentage (Numeric)      |
  +------------------------------------+
  UNIQUE (activity_id, student_id) — one attempt per student; resubmission
  overwrites the text and resets the score.
```

Junction tables `workspace_teachers` and `workspace_memberships` carry
database-level compound unique indexes on `(workspace_id, teacher_id)` and
`(workspace_id, student_id)` respectively.

### 3.2. Primary Schema Enums
*   `user_role`: `ADMIN`, `TEACHER`, `STUDENT`
*   `workspace_status`: `ACTIVE`, `ARCHIVED`
*   `membership_status`: `ACTIVE`, `REMOVED`
*   `attendance_status`: `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`
*   `activity_type`: `EXERCISE`, `HOMEWORK`, `QUIZ`, `ASSESSMENT`
*   `execution_status`: `AC`, `WA`, `CE`, `RE`, `TLE`, `OFE`

---

## 4. Administrative Management, Metrics & Admin Dashboard

The system requires structured administrative interfaces and consolidated telemetry to manage course offerings, monitor instructors, and analyze global utilization.

### 4.1. Global Admin Dashboard Overview
When an Admin accesses the primary platform dashboard, the system must render real-time, aggregated data cards containing five primary metrics to indicate active operational volume:

1.  **Total Active Student (`totalActiveStudents`):** Evaluated as the count of records in the `users` table where `role = 'STUDENT'` and accounts are active (not deactivated).
2.  **Total Active Teacher (`totalActiveTeachers`):** Evaluated as the count of records in the `users` table where `role = 'TEACHER'` and accounts are active (not deactivated).
3.  **Total Active Workspace (`totalActiveWorkspaces`):** Evaluated as the count of rows in the `workspaces` table where `status = 'ACTIVE'`.
4.  **Total Exams (`totalExams`):** Evaluated as the cumulative count of records in the `exams` table.
5.  **Total Questions (`totalQuestions`):** Evaluated as the cumulative count of records in the `questions` table.

These counters are fetched atomically via `GET /api/v1/admin/dashboard/stats`.

### 4.2. Teacher Management & Metrics
When an Admin accesses the Teacher Management panel, the system displays real-time workload metrics:
*   **Total Workspaces Taught:** Count of distinct `workspace_ids` in `workspace_teachers` linked to the teacher.
*   **Total Days Conducted:** Sum of `total_conducted_days` across all workspaces assigned to the teacher where roll call has been submitted.

### 4.3. Student Management & Metrics
When an Admin views the Student Management panel, the system displays:
*   **Active Workspaces:** The count of active workspaces the student is currently enrolled in (`membership_status = ACTIVE` AND `workspace.status = ACTIVE`).

### 4.4. Admin Account Settings
Admins manage their own credentials and the global platform configuration from the Admin Settings page (`/admin/settings`):
*   **Profile:** edit own full name and email (`GET/PATCH /api/v1/admin/account`); email uniqueness is enforced. Username is immutable.
*   **Password:** change own password (`POST /api/v1/admin/account/change-password`) after verifying the current password; the platform complexity policy (Section 2.2.3) applies.
*   **Platform Settings:** execution mode, Piston endpoint, IP binding, first-login reset enforcement, focus tracking, and auto-save interval. `PUT /api/v1/settings` is **Admin-only**; `GET /api/v1/settings` remains readable by any authenticated user because the student exam workspace consumes `autoSaveInterval` and `focusTrackingEnabled`.

### 4.5. Teacher Administration Actions
From the Teacher Management panel an Admin can, per teacher:
*   **Edit** full name and email (`PUT /api/v1/admin/users/teachers/:teacherId`).
*   **Reset Password** (`POST /api/v1/admin/users/teachers/:teacherId/reset-password`) — issues a new temporary password (displayed once) and sets `is_first_login = true`.
*   **Delete** (`DELETE /api/v1/admin/users/teachers/:teacherId`) — rejected with `409` while the teacher still owns exams or workspace assignments, to prevent cascading data loss.

### 4.6. Workspace Assignment & Execution
*   Workspaces are not isolated to a single creator. Admins create workspaces and explicitly map one or more teachers via the `workspace_teachers` junction table.
*   A Teacher cannot view or modify a Workspace unless their `user_id` is present in the `workspace_teachers` table for that specific workspace. Workspace creation is **Admin-only**; no teacher-facing creation endpoint exists.
*   Admins bypass the assignment check and may operate on any workspace with the full management surface (members, activities, timetable, roll call, attendance, reports).

### 4.7. Teacher Visibility Scoping
*   **Student management:** `GET /api/v1/teacher/students` returns only students with an ACTIVE membership in one of the teacher's assigned workspaces. The `?scope=all` variant returns a minimal directory (`id`, `username`, `fullName`) used exclusively by the workspace enrollment picker. Admins receive the full roster on both variants.
*   **Session Monitor & Live Exam Monitor:** teachers see only submissions from students enrolled in their assigned workspaces; admins see all exams and all students, including exams they did not create.

---

## 5. Anti-Cheat, Security & Session Telemetry

### 5.1. Client-Side Focus Loss Enforcement
The workspace coordinates tab/window status using the `focus_loss_policy` property returned in the active exam config:

*   **`LOG_ONLY` Configuration:** Focus losses are captured and incremented on the database session object, but no warning indicators block the candidate workspace.
*   **`WARN_AND_LOCK` Configuration:**
    *   **Offenses 1 and 2:** Detects window `blur` events (tab switches, alt-tabs) and renders a persistent modal warning that blocks the workspace until manual dismissal.
    *   **Offense 3:** Triggers an immediate, un-bypassable auto-submit routine with `close_reason: "FOCUS_LOSS_THRESHOLD"`.

#### Focus Loss Guard Rule
Auto-submission on the 3rd infraction is permitted *only* if `questions.length > 0` at the moment the window blur triggers. If a tab change is logged before the query for questions completes (such as during network initialization delay), the penalty is incremented in system state but auto-submission is **deferred**. Once questions load and `questions.length > 0` resolves, if the counter is already $\ge 3$, auto-submission fires.

#### Server-Synchronized Counter (v9.2)
Each blur offense immediately triggers `POST /api/v1/student/exams/:id/focus-loss`, which atomically increments `exam_submissions.focus_loss_count` and returns the authoritative value. `GET /:id/questions` returns the persisted `focusLossCount`, and the workspace hydrates its local counter with `max(local, server)` on load and re-entry. A page reload therefore **cannot** reset the `WARN_AND_LOCK` offense count; if the synchronized counter is already ≥ 3 when questions finish loading, auto-submission fires immediately.

### 5.2. Active-Time Timer, Floor, & Re-entry Logic
1.  **Countdown Calculation:** The countdown timer calculates the candidate's remaining duration using the workspace active-time metric instead of the local system clock:
    $$\text{remainingSeconds} = (\text{examDurationMins} \times 60) - \text{activeSeconds}$$
2.  **Timer Floor and Overflow Protection:** If $\text{remainingSeconds} \le 0$ (indicating total elapsed session activity meets or exceeds the designated duration limit), the system sets remaining time to $0$ and displays the Time's Up modal. The interface is blocked from rendering negative counts. If the value returned from the backend exceeds the allocated limit, the system clamps the runtime limit to $(\text{examDurationMins} \times 60)$ prior to evaluating remaining time.
3.  **Exit Serialization:** Exiting via **Save & Exit** makes a POST request to `/exit`, which saves the candidate's draft answers and writes `close_reason: "SAVE_AND_EXIT"` along with the updated `activeSeconds` value.
4.  **Active-Time Anti-Tamper Verification (v9.2):** the server tracks `exam_submissions.active_seconds_updated_at` as a heartbeat. On `POST /exit`, the reported `activeSeconds` is clamped to `stored + elapsed_since_heartbeat + 5s drift`, may never decrease below the stored value, and remains capped at `examDurationMins × 60`. Client-side payload manipulation therefore cannot inflate or deflate active time beyond real elapsed wall time.
5.  **Re-entry Database Transaction:** When a student re-enters the exam via `GET /api/v1/student/exams/:id/questions`, the server clears `close_reason` back to `NULL` within the **same database transaction** that returns the question schema. This ensures the monitor dashboard cannot observe a submission in a transient `PENDING` state while the student is actively in the workspace.

### 5.3. Submission Status Priority Algorithm
The system evaluates and displays candidate session status across teacher monitoring dashboards, session archives, and student portal views using a strict, single-pass priority algorithm:

```text
[Evaluate Submission Status]
             |
             |---> Condition 1: submittedAt IS NOT NULL? ------------------------> SUBMITTED
             |
             |---> Condition 2: submittedAt IS NULL && exam.endTime < NOW()? ----> CANCELLED
             |
             |---> Condition 3: closeReason == "SAVE_AND_EXIT" &&
             |                  exam.endTime >= NOW()? --------------------------> PENDING
             |
             +---> Default: -----------------------------------------------------> IN_PROGRESS
```

No subsequent rule can override a non-null `submittedAt` timestamp. If an exam is marked `SUBMITTED`, that state takes absolute precedence over any persistent `closeReason` keys.

---

## 6. Workspace Class & Timetable Governance

### 6.1. Workspace Lifecycle
Workspaces begin in the `ACTIVE` state. Teachers configure the timetable, manage student rosters, record attendance, and assign homework or assessments.

```text
[Active Workspace] ──(Archive Command)──► [Archived Workspace] (Read-Only)
        ▲                                          │
        │                                          ▼
        └───────────(Admin Override)───────────────┘ (Un-archive)
```

1.  **Archived Read-Only Lock:** Once archived, the workspace becomes read-only. Further changes to members, timetables, attendance data, or assigned activities are blocked.
2.  **Deletion Protection:** Workspaces containing associated records in `workspace_memberships`, `teaching_days`, or `workspace_activities` cannot be deleted. The workspace must be archived instead.
3.  **Archive Safeguard Rules:** Before executing an archive operation, the system validates two conditions:
    *   No student has an `IN_PROGRESS` exam attempt within any activity assigned to the workspace.
    *   All teaching days with a `scheduled_date` $\le$ the current date have at least one recorded attendance entry.
    If either condition fails, the system blocks archiving and returns `WORKSPACE_ARCHIVE_BLOCKED`.

### 6.2. Timetable & Sequential Integrity
*   **Gapless Re-sequencing:** If a scheduled class day is removed from the timetable, the system automatically reorders all remaining days to maintain a continuous, sequential index (e.g., Days 1, 2, 4 are updated to Days 1, 2, 3). This update runs as an atomic database transaction.
*   **Deletion Protection:** Deleting a class day is blocked if any attendance records are associated with it. The instructor must delete those attendance records before the day can be removed.

### 6.3. Attendance (Roll Call) Rules
*   **Transactional Accuracy:** Saving attendance is an atomic transaction. Partial saves are blocked. If any single validation check fails, the transaction is rolled back and the API returns a `500` error with `ROLLCALL_SAVE_FAILED`.
*   **Quick Roll Call Logic:** Quick Roll Call initializes the interface by marking all students with `membership_status = ACTIVE` as `PRESENT`. The instructor can then adjust exceptions (e.g., marking specific students `ABSENT` or `LATE`) before submitting the batch update.

---

## 7. Workspace Activities & Exam Scoping

### 7.1. Activity Matrix
Assigned activities use the following configurations:

| Type | Backend Engine Required | Grading Mode | Visibility Constraints |
| :--- | :---: | :--- | :--- |
| `QUIZ` | ✅ | Multiple choice or coding template | Scope-restricted to class members. |
| `ASSESSMENT` | ✅ | Real-time evaluated exams with browser telemetry | Focus Loss warnings active. |
| `HOMEWORK` | Optional | Sandbox tests / Text answers | Flexible due date. |
| `EXERCISE` | Optional | Practice code executions | Hidden test cases revealed on run. |

### 7.2. Activity Assignment and Workspace Isolation
1.  **Access Isolation:** Activities assigned to a workspace are accessible *only* to enrolled student members of that workspace, regardless of the exam's global `access_type` setting. Students not on the workspace roster cannot access the exam or submit answers.
2.  **Assignment Limits:** An `exam_id` can be reused across different class workspaces, but cannot be assigned more than once to the same workspace. If a duplicate assignment is attempted, the system rejects it with a `409 Conflict` error (`DUPLICATE_EXAM_IN_WORKSPACE`).
3.  **Active Assignment Protection:** Deleting or unassigning an activity from a workspace is blocked if any student has already submitted an attempt for that activity within that workspace.
4.  **Bulk Exam Assignment (v9.2):** `POST /teacher/workspaces/:id/activities` accepts `examIds: []` to assign several exams in one request — one activity is created per exam, titled after the exam and sharing the chosen type, teaching day, and due date. Already-assigned or inaccessible exams are skipped and itemized in the response (`created` / `skipped`).
5.  **Bulk Removal (v9.2):** `POST .../members/bulk-remove` and `POST .../activities/bulk-remove` remove multiple students/activities in one action. Guarded records (submissions present) are skipped, not failed, and reported per item (`removed` / `blocked`).

### 7.3. Standalone Activity Submissions (v9.2)
`EXERCISE` and `HOMEWORK` activities without an `exam_id` accept free-text student responses:
*   **Student:** `POST /student/workspaces/:id/activities/:activityId/submit` with `{ textResponse }`. One attempt per student (resubmission overwrites and clears any score). Blocked on archived workspaces and rejected for exam-backed activities.
*   **Teacher grading:** `GET/PUT /teacher/workspaces/:id/activities/:activityId/attempts` lists attempts and records a `scorePercentage` (0–100).
*   **Reporting:** a standalone attempt surfaces as `SUBMITTED` (with its graded score) in the student activity list and in end-of-class report calculations, identical to exam-backed activities.

---

## 8. Automated Grading Engine Architecture

### 8.1. Quiz Evaluation
Quizzes utilize a proportional partial-credit grading model:
$$\text{Score} = \left( \frac{\text{Correct Selections}}{\text{Total Correct Options}} \times \text{Question Points} \right)$$
If a student selects any incorrect options, the score for that question is automatically set to $0$.

### 8.2. Compiler Sandbox Pipeline (Code Questions)
Code tasks are routed to the execution pipeline using the Piston API as the primary executor:

1.  **Compilation & Sandbox Execution:** Code runs inside isolated sandbox containers. Every request includes a `run_memory_limit` of `262144` (256 MB) to prevent server out-of-memory errors.
2.  **Output Flood Control (OFE):** If an application's output exceeds **10,000 characters**, execution is stopped. The test case is marked `OFE` (Output Limit Exceeded) and scored as incorrect.
3.  **Runtime Limit (TLE):** Enforced via the configured `time_limit` parameter. Execution is killed with a SIGKILL signal if runtime exceeds this threshold, returning `TLE` (Time Limit Exceeded).
4.  **Stdout Normalization:** Floating-point outputs are normalized to prevent grading mismatches from minor calculation differences (e.g., `12.50000001` matches `12.5`).
5.  **Vacuous Pass Safeguard:** If a program exits successfully without producing output, and the expected test case output is empty, the grader marks the result as **No Output Produced** (amber) rather than passing.

#### Compiler Fallback Mechanics
If the primary execution service is unavailable, the system redirects traffic to a local executor:

```text
[Client Run Request]
          │
          ▼
   {Piston API Ok?} ──(Yes)──► [Container Sandbox]
          │
         (No / Timeout 10s)
          │
          ▼
   {DISABLE_LOCAL_FALLBACK == true?} ──(Yes)──► [Return 503 PISTON_UNAVAILABLE]
          │
         (No)
          │
          ▼
   [Local Child-Process Executor]
   (Emits WARN-level Server Log, returns backend header: "LOCAL_FALLBACK")
```

The unsandboxed local fallback execution engine is restricted to staging and development environments, and **must** be disabled in production deployments by setting `DISABLE_LOCAL_FALLBACK=true`.

### 7.3. Browser Automation Sandbox (XPath & CSS Selector Questions)
Locator evaluation is performed on the server inside a virtual DOM environment using `jsdom`:

1.  **Page Isolation:** For each test case, the system instantiates a fresh `jsdom` instance from the configured `target_payload` (either by rendering raw HTML snippet payloads or fetching static source files from remote URLs).
2.  **SSRF Mitigation Guard:** Remote URL fetches are validated before execution. Requests to private, loopback, or local IP address spaces (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`) are blocked and return a `400 Bad Request` error (`SSRF_BLOCKED`). Remote fetches have a hard 5-second timeout (`XPATH_FETCH_TIMEOUT`). **v9.2 hardening:** the target hostname is resolved via DNS *before* fetching and every resolved address is checked against the private CIDR ranges (DNS-rebinding guard, including IPv4-mapped IPv6); redirects are followed manually with a maximum of 3 hops, re-validating each hop; and non-HTML/text content types are rejected (no media/binary downloads).
3.  **XPath 1.0 Specification Constraint:** The server-side evaluation engine supports the **XPath 1.0 standard**. XPath 2.0 or 3.0 functions (such as `fn:matches()`, regular expression filters, or string manipulation helpers) are not supported and will return a parse error (`XPATH_PARSE_ERROR`). CSS Selector Mode is recommended for complex attribute matching.
4.  **Static Execution Model:** `jsdom` parses static markup only. Embedded JavaScript on target pages is not executed. For pages with dynamic client-side rendering, teachers must paste the fully rendered HTML output from browser developer tools into the HTML Snippet field.
5.  **AC vs. WA Selector Match Verification:** Matches are evaluated using the following criteria:

```text
       Selector Type: [XPATH]
       AC Criteria: MATCH_COUNT(Student) == MATCH_COUNT(Teacher)
                    AND Evaluated Node references match byte-for-byte in the JSDOM instance.

       Selector Type: [CSS]
       AC Criteria: MATCH_COUNT(Student) == MATCH_COUNT(Teacher)
                    AND Student outHTML, in document order, matches Teacher outerHTML string.
```

If both selectors return zero elements, the evaluation fails and is marked as an incorrect match (`WA`). Empty expressions cannot pass a test case.

---

## 9. End-of-Class Reports

### 9.1. Summary Report Generation
Instructors can generate reports for archived workspaces. Each generation creates a new point-in-time record in `workspace_class_reports`. The most recent record is used as the canonical class report. The report is exportable as a `.xlsx` spreadsheet, with each student mapped to an individual row.

### 9.2. Report Calculation Metrics
*   **Alphabetical Sort Order:** Student datasets are sorted alphabetically by `fullName` in the output file.
*   **Average Score Formula:** The system calculates `averageScore` using only activities with a status of `SUBMITTED`:
    $$\text{averageScore} = \frac{\sum \text{Score Percentage (Submitted Activities)}}{\text{Total Submitted Activities Count}}$$
    If a student has no submitted activities, the average score is displayed as a blank dash `"—"`. Unsubmitted attempts are excluded from this average.
*   **Student Visibility Boundaries:** When a student requests the report, the system limits the response payload to their individual performance summary, preventing access to classmates' grades or attendance data.

---

## 10. API Endpoint Catalog

All routes are prefixed with `/api/v1`.

### 10.1. Authentication Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticate user credentials. Returns a payload containing account permissions, active tokens, and profile states. Client-side login validates username/password fields are non-empty before calling the API, returning inline errors in Vietnamese. |
| `POST` | `/auth/password-reset` | Process password reset validation workflows. |

### 10.2. Admin Management Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/admin/dashboard/stats` | Retrieve global aggregated stats for the admin dashboard (Active Students, Active Teachers, Active Workspaces, Total Exams, Total Questions). |
| `GET` | `/admin/users/teachers` | Retrieve global list of teacher profiles, active workspace assignments, and teaching duration logs. |
| `POST` | `/admin/users/teachers` | Create a new Teacher account profile. |
| `GET` | `/admin/users/students` | Retrieve student profiles with associated active workspace metrics. |
| `POST` | `/admin/users/students` | Create a new Student account profile. |
| `POST` | `/admin/workspaces/:id/teachers/:teacherId` | Link a teacher to a workspace in the `workspace_teachers` table. |
| `DELETE` | `/admin/workspaces/:id/teachers/:teacherId` | Remove a teacher's workspace access. |
| `POST` | `/admin/workspaces/:id/unarchive` | Admin override to restore an `ARCHIVED` workspace to `ACTIVE`. |
| `GET / POST` | `/admin/workspaces` | Global workspace list with teacher assignments and member counts / create a workspace. |
| `DELETE` | `/admin/workspaces/:id` | Delete an empty workspace (blocked with related records; archive instead). |
| `PUT / DELETE` | `/admin/users/teachers/:teacherId` | Edit a teacher profile / delete the account (blocked while exams or assignments exist). |
| `POST` | `/admin/users/teachers/:teacherId/reset-password` | Issue a new temporary password; forces change on next login. |
| `GET / PATCH` | `/admin/account` | View / update the admin's own profile (full name, email). |
| `POST` | `/admin/account/change-password` | Change the admin's own password (complexity policy enforced). |
| `GET / PUT` | `/settings` | Read platform settings (any authenticated role) / update them (**Admin-only**). |

> **Admin pass-through:** the ADMIN role is additionally authorized on every `/teacher/**` route below with global scope — ownership (`created_by`) and workspace-assignment filters are bypassed for admins.

### 10.3. Teacher Workspace & Class Scheduling Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/teacher/workspaces` | List active workspaces assigned to the authenticated teacher. |
| `GET` | `/teacher/workspaces/:id` | Get details for an assigned workspace. Rejects with `403 Forbidden` if the teacher is not assigned. |
| `PUT` | `/teacher/workspaces/:id` | Update workspace parameters (name, description, total_days). |
| `POST` | `/teacher/workspaces/:id/archive` | Archive the workspace. Validates that no active student sessions exist. |
| `GET` | `/teacher/workspaces/:id/members` | Retrieve student list for the workspace. |
| `POST` | `/teacher/workspaces/:id/members` | Enroll students into the workspace. |
| `DELETE` | `/teacher/workspaces/:id/members/:studentId` | Unenroll a student. Blocked if the student has submission records. |
| `POST` | `/teacher/workspaces/:id/members/bulk-remove` | Remove multiple students at once; guarded students are skipped and itemized. |
| `GET / POST` | `/teacher/workspaces/:id/activities` | List activities / assign an activity. `POST` accepts `examIds: []` for bulk exam assignment. |
| `PUT / DELETE` | `/teacher/workspaces/:id/activities/:activityId` | Update or remove an activity assignment. |
| `POST` | `/teacher/workspaces/:id/activities/bulk-remove` | Remove multiple activities at once; guarded activities are skipped and itemized. |
| `GET / PUT` | `/teacher/workspaces/:id/activities/:activityId/attempts` | List / grade standalone activity attempts. |

> `GET /teacher/workspaces` lists only workspaces assigned to the authenticated teacher (all workspaces for admins). Workspace creation is Admin-only as of v9.2.

### 10.4. Timetable & Daily Attendance Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/teacher/workspaces/:id/timetable` | Get the timetable days for a workspace, ordered sequentially by `day_number`. |
| `POST` | `/teacher/workspaces/:id/timetable` | Add a new teaching day to the workspace. |
| `PUT` | `/teacher/workspaces/:id/timetable/:dayId` | Update details for a teaching day (scheduled date, topic, notes). |
| `DELETE` | `/teacher/workspaces/:id/timetable/:dayId` | Remove a teaching day from the timetable. Blocks if attendance records exist. |
| `GET` | `/teacher/workspaces/:id/timetable/:dayId/rollcall` | Get the recorded attendance list for a teaching day. |
| `POST` | `/teacher/workspaces/:id/timetable/:dayId/rollcall` | Save or overwrite attendance data for a teaching day. Updates run atomically. |
| `DELETE` | `/teacher/workspaces/:id/timetable/:dayId/rollcall` | Void all attendance records for a day (prerequisite for deleting the day). |
| `GET` | `/teacher/workspaces/:id/attendance` | Retrieve the global attendance matrix for the workspace (all enrolled students $\times$ all scheduled days). |

### 10.5. Exam Creation & Question Config Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/teacher/exams` | Get the exams list managed by the authenticated teacher. |
| `POST` | `/teacher/exams` | Create a new exam, including configuration of anti-cheat telemetry modes. |
| `GET/PUT/DELETE` | `/teacher/exams/:id` | View, update, or delete exam configurations. |
| `POST` | `/teacher/exams/:id/clone` | Create a duplicate copy of an exam. |
| `GET/POST` | `/teacher/exams/:id/questions` | List questions or append a new question (Quiz, Code, or XPath). |
| `POST` | `/teacher/exams/:id/xpath-verify` | Verify a test case selector against HTML snippets or URLs. Returns matched markup. |
| `POST` | `/teacher/exams/:id/import-questions` | Bulk import questions from a CSV/Excel file. |

### 10.6. Workspace Live Monitoring & Control Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/teacher/exams/:id/monitor` | Real-time SSE exam monitoring dashboard tracking status, score, focus-loss count, and close reason. |
| `POST` | `/teacher/exams/:id/force-submit` | Force-submit an active student's exam attempt. |

### 10.7. Final Submission & Exit Endpoint Contracts

#### Student Save & Pause Activity
*   **Route:** `POST /student/exams/:id/exit`
*   **Request Envelope:**
```json
{
  "activeSeconds": 342
}
```
*   **Response Payload (`200 OK`):**
```json
{
  "message": "Draft saved. Exam session paused.",
  "closeReason": "SAVE_AND_EXIT",
  "activeSeconds": 342
}
```

#### Teacher Forced Submission
*   **Route:** `POST /teacher/exams/:id/force-submit`
*   **Request Envelope:**
```json
{
  "studentId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```
*   **Response Payload (`200 OK`):**
```json
{
  "message": "Student submission closed and graded.",
  "submittedAt": "2026-07-01T15:30:00Z",
  "closeReason": "FORCE_SUBMITTED",
  "finalScore": 75.0
}
```
Force-submitting locks the student out of the exam session and saves their final calculated score.

### 10.8. Class Performance Report Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/teacher/workspaces/:id/report` | Generate or regenerate the point-in-time report snapshot. |
| `GET` | `/teacher/workspaces/:id/report` | Retrieve the latest generated report payload. |
| `GET` | `/teacher/workspaces/:id/report/export` | Export the latest class report as a `.xlsx` spreadsheet. |

### 10.9. Student Workspaces & Activities Portal Routes
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/student/workspaces` | Get the workspaces the student is enrolled in, returning `submissionStatus` per activity. Deprecated fields `activeAttemptCancelled` and `activeAttemptPaused` must not be used. |
| `GET` | `/student/workspaces/:id` | Get details and assigned activities for a workspace. |
| `GET` | `/student/workspaces/:id/timetable` | Read-only view of the classroom schedule. |
| `GET` | `/student/workspaces/:id/attendance` | Read-only view of the student's own attendance records. |
| `GET` | `/student/workspaces/:id/activities` | List activities assigned to the student's workspace. |
| `GET` | `/student/workspaces/:id/report` | View own report summary (only accessible post-archive). |
| `POST` | `/student/workspaces/:id/activities/:activityId/submit` | Submit a free-text response for a standalone (non exam-backed) activity. |
| `POST` | `/student/exams/:id/focus-loss` | Persist one focus-loss offense server-side; returns the authoritative counter. |

---

## 11. Standardized Error Handling & Code Reference

### 11.1. Standard Error Response Format
All API error responses use a consistent JSON envelope to simplify client-side validation handling:

```json
{
  "error": {
    "code": "EXAM_WINDOW_CLOSED",
    "message": "The exam window has closed and no further actions are permitted.",
    "httpStatus": 403
  }
}
```

### 11.2. Consolidated Error Code Catalog

| Error Code | HTTP Status | Trigger Condition |
| :--- | :---: | :--- |
| `INVALID_ACTIVE_SECONDS` | 400 | The `activeSeconds` value is missing, negative, or not an integer. |
| `EXAM_WINDOW_CLOSED` | 403 | Attempted to start, resume, save, or submit an exam after the scheduled end time. |
| `ALREADY_SUBMITTED` | 409 | Attempted to modify or submit an exam that is already in the `SUBMITTED` state. |
| `SUBMISSION_NOT_FOUND` | 404 | No submission record matches the student ID and exam ID. |
| `EXAM_NOT_FOUND` | 404 | The requested exam ID does not exist. |
| `WORKSPACE_NOT_FOUND` | 404 | The requested workspace ID does not exist or is not assigned to the teacher. |
| `WORKSPACE_ARCHIVED` | 409 | Attempted a write operation (e.g., updating memberships, timetable, roll call) on an archived workspace. |
| `WORKSPACE_ARCHIVE_BLOCKED` | 409 | Archiving failed because there are active student sessions or missing roll call records on scheduled days. |
| `STUDENT_NOT_MEMBER` | 403 | A student attempted to access a workspace they are not enrolled in. |
| `DUPLICATE_TEACHING_DAY_DATE` | 409 | Two timetable entries in the same workspace share the same date. |
| `TEACHING_DAY_HAS_ATTENDANCE` | 409 | Attempted to delete a scheduled day that has existing attendance records. |
| `ACTIVITY_HAS_SUBMISSIONS` | 409 | Attempted to remove an activity that has already been submitted by students. |
| `REPORT_NOT_GENERATED` | 404 | Requested a workspace report before it has been generated. |
| `ROLLCALL_SAVE_FAILED` | 500 | Database transaction failed during attendance save. All changes rolled back. |
| `DUPLICATE_EXAM_IN_WORKSPACE` | 409 | Attempted to assign the same exam to a workspace more than once. |
| `MEMBER_HAS_SUBMISSIONS` | 409 | Attempted to unenroll a student who has active submissions in the workspace. |
| `WORKSPACE_REPORT_NOT_ARCHIVED` | 400 | Attempted to generate a performance report before the workspace is archived. |
| `FORBIDDEN` | 403 | User lacks permission for the requested action. |
| `FORCE_PASSWORD_RESET_REQUIRED` | 403 | First-time login password change is required. |
| `FOCUS_LOSS_SUBMIT_FAILED` | 500 | Auto-submission failed during a focus-loss lock. |
| `PISTON_UNAVAILABLE` | 503 | Piston sandbox service is offline and local fallback is disabled. |
| `SSRF_BLOCKED` | 400 | XPath URL fetch targeted an internal or private IP address space. |

---

## 12. Proposed Architectural Enhancements & Improvement Vectors

To improve stability, flexibility, and overall operations of the workspace module, the following incremental enhancement vectors are proposed.

### 12.1. Workspace Grade Policies & Score Weighting
The basic version computes an unweighted arithmetic average of all submitted exams/quizzes.
*   **Proposed Enhancement:** Introduce custom grade weights per workspace.
*   **Schema Extension:**
```text
+---------------------------------+
|     workspace_grade_policies    |
+---------------------------------+
| PK id (UUID)                    |
| FK workspace_id                 |
|    activity_type (Enum)         |
|    weight_percentage (Numeric)  |
+---------------------------------+
```
*   **Behavioral Change:** When generating reports, `averageScore` will evaluate according to defined weights (e.g., Assessments = 50%, Quizzes = 30%, Homework = 20%). If no policy exists, the calculation falls back to an unweighted average.

### 12.2. Batch Timetable Generation Utility
Creating sequential teaching days manually presents data entry overhead for multi-week cohorts.
*   **Proposed Enhancement:** Introduce an endpoint to generate a series of `teaching_days` using recurrence parameters.
*   **New API Endpoint:**
    *   `POST /api/v1/teacher/workspaces/:id/timetable/generate`
*   **Request Payload Parameters:**
    *   `startDate` (Date)
    *   `occurrences` (Integer)
    *   `daysOfWeek` (Array of Integers, e.g., `[1, 3]` for Monday/Wednesday)
    *   `excludeHolidays` (Boolean)
*   **Validation Rule:** The system checks for database collisions on dates before applying the batch transaction.

### 12.3. Score Override & Audit Tracking
Standard operational grading often requires manual grade adjustment (e.g., for attendance participation or late penalties).
*   **Proposed Enhancement:** Permit score overrides within `workspace_class_reports` with structured logging.
*   **Schema Extension:**
```text
+---------------------------------+
|     workspace_score_overrides   |
+---------------------------------+
| PK id (UUID)                    |
| FK workspace_id                 |
| FK student_id                   |
| FK activity_id                  |
|    original_score (Numeric)     |
|    overridden_score (Numeric)   |
|    reason (Text)                |
| FK overridden_by (User UUID)    |
|    created_at (Timestamp)       |
+---------------------------------+
```

### 12.4. Webhooks & Messaging for Auto-Submission Events
When active exams are force-submitted or timers expire, instant status changes need to propagate down to classroom interfaces.
*   **Proposed Enhancement:** Integrate an event-driven hook framework inside the transaction service.
*   **Scope:** Trigger lightweight JSON payloads to external webhooks on events such as:
    *   `workspace.archived`
    *   `exam.force_submitted`
    *   `attendance.marked`
*   This facilitates integration with standard learning management systems (LMS) or notification microservices.

---

*END OF REQUIREMENTS SPECIFICATION DOCUMENT (RSD) — v9.2*
```