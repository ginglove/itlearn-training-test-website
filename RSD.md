# Requirements Specification Document (RSD)
## Enterprise Online Quiz & Hybrid Coding Platform
**Document Version:** 5.0 (Current Production State)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

---

## 1. System Overview & Scope

### 1.1. Purpose
The Online Quiz and Coding Practice Platform is a unified web-based assessment application designed to automate theoretical and practical programming examinations. The platform minimizes manual grading overhead, implements strict academic integrity controls, and delivers real-time monitoring and analytics to instructors.

### 1.2. High-Level System Architecture
The platform is built on a Next.js full-stack architecture with API routes handling business logic and a PostgreSQL database (via Drizzle ORM) as the primary datastore.

```
+---------------------------------------------------------------------------------+
|                                 FRONTEND CLIENT                                 |
|                   React.js / Next.js SPA (TypeScript & Tailwind)                |
+---------------------------------------------------------------------------------+
                                         |
                                         | HTTPS
                                         v
+---------------------------------------------------------------------------------+
|                         NEXT.JS API ROUTES (Edge/Node Runtime)                  |
|              /api/v1/student/**, /api/v1/teacher/**, /api/v1/auth/**            |
+---------------------------------------------------------------------------------+
          |                               |                           |
          v                               v                           v
+--------------------+         +--------------------+     +-----------------------+
| PRIMARY DATASTORE  |         |   CODE EXECUTION   |     |  INTERNAL WORKERS     |
| Neon PostgreSQL    |         |   Piston API /     |     |  /api/v1/internal/    |
| (Drizzle ORM)      |         |   Local Fallback   |     |  execute-code         |
+--------------------+         +--------------------+     +-----------------------+
```

- **Frontend Client (SPA):** Built with React.js/Next.js and TypeScript. Handles client-side state, exam workspace, and draft auto-save.
- **API Routes:** Next.js route handlers implementing all business logic, authentication, grading, and monitoring.
- **Code Execution:** Configurable via platform settings — supports Piston API, local fallback, or API-only mode.
- **Primary Datastore:** Neon PostgreSQL managed via Drizzle ORM with typed schema and migrations.

---

## 2. User Roles & Authentication Lifecycles

### 2.1. Role Definitions
- **Teacher (Evaluator):** Administers exams, designs question banks, configures test cases and runtime limits, registers student cohorts, monitors live sessions, and reviews grading reports.
- **Student (Candidate):** Authenticates via instructor-provisioned credentials, participates in scheduled exam sessions, writes code or selects quiz answers, and reviews results after submission.

### 2.2. Enforced Authentication & First-Time Lifecycle
Self-registration is disabled. All student credentials are provisioned by the teacher via CSV/Excel import.

```
[Teacher Provisions Accounts via Bulk Import]
             |
             v
[DB: user created with is_first_login = TRUE, temp password]
             |
             v
[Student logs in with temporary credentials]
             |
             v
[Auth middleware: is_first_login == TRUE?]
             |
      +------+------+
      | YES         | NO
      v             v
[Redirect: Force Password Reset]   [Redirect: Dashboard]
      |
      v
[Enforce regex: >=8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special]
      |
      v
[Update DB: password_hash, is_first_login = FALSE]
      |
      v
[Redirect: Dashboard]
```

#### Lifecycle Phase 1: Account Seeding
Instructor uploads CSV/Excel with: `student_id`, `full_name`, `email`.

#### Lifecycle Phase 2: Credential Generation
System generates a unique temporary password per user, inserts with `is_first_login = TRUE`.

#### Lifecycle Phase 3: Access Interception
On `POST /api/v1/auth/login`, if `is_first_login` is `TRUE`, the API returns:
```json
{
  "status": "FORCE_PASSWORD_RESET",
  "reset_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Lifecycle Phase 4: Password Complexity Enforcement
```regex
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$
```
Minimum 8 characters, at least one uppercase, one lowercase, one digit, one special character.

#### Lifecycle Phase 5: State Normalization
Backend updates password hash, sets `is_first_login = FALSE`, invalidates temp token, redirects to dashboard.

---

## 3. Security, Monitoring & Anti-Cheat Subsystem

### 3.1. Client-Side Telemetry & Event Hooks
- **Focus Loss Tracker:** Monitors `blur` events. Each focus loss increments the counter and displays an on-screen warning.
- **Session IP Binding (configurable):** Client IP is recorded at submission start. Platform settings allow enabling/disabling enforcement.
- **Focus Tracking Toggle:** Teachers can enable/disable focus tracking globally via platform settings.

### 3.2. Network Interruption & Session Resilience
- **Auto-Save Engine:** Drafts (code and quiz selections) are automatically synced to the database every N seconds (configurable in platform settings, default 15s).
- **Resume on Re-entry:** When a student exits and returns to an in-progress exam, all draft answers are restored from the database via `GET /api/v1/student/exams/:id/draft`.
- **Shuffle Order Persistence:** When an exam has `isShuffled = TRUE`, the question order is randomly determined on first load, persisted to the `exam_submissions.question_order` column, and restored exactly on all subsequent loads. This prevents students from receiving a different question order after Save & Exit.

### 3.3. Exam Monitoring (Teacher)
The teacher monitoring dashboard (`GET /api/v1/teacher/exams/:id/monitor`) provides real-time session state:

| Student Name | IP | Focus Losses | Time Elapsed | Progress | Status | Score | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| John Doe | 192.168.1.1 | 0 | 00:35:22 | 4/6 (66%) ✓ 3 pass ✗ 1 fail | Active | 45.00 / 100.00 | Force Submit |
| Jane Smith | 192.168.1.2 | 3 | 00:12:05 | 2/6 (33%) ✓ 1 pass ✗ 1 fail | Submitted | 12.50 / 100.00 | Force Submit |

**Progress Column:** Shows `answered/totalQuestions` with a percentage progress bar and a pass/fail breakdown badge. The total question count (`totalQuestions`) is returned by the monitor SSE stream alongside `totalPossibleScore` and `roster`.

---

## 4. Candidate Workspace Interface Design (Hybrid Mode)

### 4.1. Global Exam Wrapper
The layout is constrained to the viewport (`h-screen`). Navigation uses a left sidebar question map.

```
+---------------------------------------------------------------------------------+
| [Logo] Exam Session                                        [ TIMER: 01:24:15 ]  |
| [ Save & Exit ]  [ Submit Exam ]                                                |
+-----------------------------------+---------------------------------------------+
|  Questions Map                    |                                             |
|                                   |           ACTIVE WORKSPACE                  |
|  [1][2][3][4]  ← QUIZ (blue)     |                                             |
|  [5][6]        ← CODE (yellow)   |                                             |
|                                   |                                             |
|  Focus loss detected (N)          |                                             |
+-----------------------------------+---------------------------------------------+
|         [ Previous ]                                      [ Next ]             |
+---------------------------------------------------------------------------------+
```

- **Header Bar:** Exam title, live countdown timer (flashes red under 5 minutes), Save & Exit button, Submit Exam button.
- **Question Map Sidebar:** Numbered buttons colored by state and question type:
  - **QUIZ questions:** Brand blue (active = solid blue, answered = blue/20, unanswered = surface)
  - **CODE questions:** Amber/yellow (active = solid amber, answered = amber/20, unanswered = surface)
- **Footer:** Previous / Next navigation buttons.

### 4.2. Mode A: Quiz View
- Activated when `question.type === "QUIZ"`.
- Displays question text and selectable option cards with radio (single) or checkbox (multiple) interaction.
- Supports multiple-correct-answer questions (`isMultipleChoice`).

### 4.3. Mode B: Integrated Code Editor
- Activated when `question.type === "CODE"`.
- Full-height code editor (textarea with monospace font) with language selector.
- Bottom panel with two tabs:
  - **Sample Cases:** Shows public test cases (input + expected output) fetched at load time.
  - **Execution Output:** Shows the result of the last "Run Code" execution for this question.
- **Run Code button:** Executes the student's code against public test cases via `POST /api/v1/student/exams/:id/run-code`. Results are stored per question and persist when switching between questions.
- **Untested Code Warning:** When clicking Submit Exam, if any CODE question has never been run, a modal lists the untested questions and requires the student to confirm ("Submit Anyway") or go back to test ("Go Back & Test").

### 4.4. UI Notification System (Toast)
All user-facing feedback (success, error, warning, info) is delivered as slide-in toast pop-ups in the top-right corner. Toasts auto-dismiss after 4 seconds and can be manually dismissed. This applies to all teacher and student pages. No inline banners or `alert()` dialogs are used.

---

## 5. Evaluator/Teacher Management Panel & Data Ingestion

### 5.1. Exam Management
- Create, edit, delete exams with: title, description, duration, start/end time, shuffle toggle, allowed attempts, access type (ALL / RESTRICTED).
- Clone exam: duplicates all settings, questions, options, and test cases.
- RESTRICTED access: assign specific students to an exam.

### 5.2. Question Builder
Teachers can create questions directly in the UI or import via Excel/CSV.

**Supported Question Types:**
- `QUIZ`: Multiple choice (single or multiple correct answers). Requires ≥2 options, ≥1 correct.
- `CODE`: Programming task with starter code, teacher reference code, time limit, memory limit, and test cases.

**Excel/CSV Import Template:**
```
| type | points | question_text | option_a | option_b | option_c | option_d | correct_identifier |
| QUIZ | 5      | What is O(1)? | Constant | Linear   | Log      | Quad     | A                  |
```
Import is atomic — all rows succeed or the transaction rolls back.

### 5.3. Coding Task Configuration
Per code question, teachers configure:
- **Time Limit (ms):** Maximum execution time.
- **Memory Limit (KB):** Maximum memory usage.
- **Starter Code:** Pre-filled code shown to students.
- **Teacher Reference Code:** When set, runs dynamically at grading/test time and its stdout becomes the expected output (overriding static `output_data`). This allows the expected output to be generated programmatically.
- **Test Cases:** Each test case has `input_data`, `output_data`, and `is_hidden` flag. Hidden test cases are used for final grading only; public test cases are shown as samples to students.

### 5.4. Platform Settings (Admin)
Teachers configure global settings:
- Piston API URL and execution mode (Local Fallback / Local Only / API Only)
- Session IP Binding (on/off)
- Enforce First Login Password Reset (on/off)
- Focus Tracking (on/off)
- Auto-Save Interval (seconds)

---

## 6. Database Schema

### 6.1. Entity Relationship Overview

```
   +------------------+         +------------------+         +----------------------+
   |      users       |         |      exams       |         |   exam_submissions   |
   +------------------+         +------------------+         +----------------------+
   | PK id (UUID)     |<--------| FK created_by    |         | PK id (UUID)         |
   |    username      |         |    title         |         | FK exam_id           |
   |    password_hash |         |    description   |         | FK student_id        |
   |    full_name     |         |    duration      |         |    start_at          |
   |    email         |         |    start_time    |         |    submitted_at      |
   |    role          |         |    end_time      |         |    total_score       |
   |    is_first_login|         |    is_shuffled   |         |    client_ip         |
   |    created_at    |         |    allowed_      |         |    focus_loss_count  |
   +------------------+         |    attempts      |         |    attempt           |
                                |    access_type   |         |    question_order    | ← persists shuffle
                                +------------------+         +----------------------+
                                         |
                                         v
                                +------------------+
                                |    questions     |
                                +------------------+
                                | PK id (UUID)     |
                                | FK exam_id       |
                                |    type (Enum)   |
                                |    title         |
                                |    content       |
                                |    points        |
                                |    sort_order    |
                                +------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+          +--------------------+         +------------------+
|   quiz_options   |          |    code_configs    |         |    test_cases    |
+------------------+          +--------------------+         +------------------+
| PK id (UUID)     |          | PK id (UUID)       |         | PK id (UUID)     |
| FK question_id   |          | FK question_id     |         | FK question_id   |
|    option_text   |          |    time_limit      |         |    input_data    |
|    is_correct    |          |    memory_limit    |         |    output_data   |
+------------------+          |    starter_code    |         |    is_hidden     |
                              |    teacher_code    |         +------------------+
                              +--------------------+

                              +----------------------+
                              |  submission_details  |
                              +----------------------+
                              | PK id (UUID)         |
                              | FK submission_id     |
                              | FK question_id       |
                              |    selected_options  |
                              |    source_code       |
                              |    language          |
                              |    status            |
                              |    score             |
                              +----------------------+
```

### 6.2. Key Schema Notes

- `exam_submissions.question_order` (JSON, nullable): Stores the shuffled question ID order for a submission. Set on first question load when `exam.isShuffled = TRUE`; reused on resume.
- `exam_submissions.attempt`: Supports multiple attempts per student per exam (bounded by `exam.allowed_attempts`).
- `exam_submissions.access_type`: `ALL` (open) or `RESTRICTED` (assigned students only via `exam_assignments` table).
- `code_configs.teacher_code`: When non-empty, the system runs this code at grading time and uses its stdout as the expected output instead of the static `output_data` value.
- `test_cases.is_hidden`: Hidden test cases are excluded from `GET /api/v1/student/exams/:id/questions` and run-code endpoints; used only during final grading.

---

## 7. Automatic Grading Architecture & Sandbox Execution

### 7.1. Quiz Auto-Grading Algorithm

$$\text{Score} = \text{Points} \times \left( \frac{\text{Correct Selections}}{\text{Total Correct Options}} \right)$$

**Constraints:**
1. **Partial Credit:** Proportional credit for partially correct selections.
2. **Incorrect Selections:** Any incorrect option selected → 0 points for the question.
3. Students cannot game the system by selecting all options.

### 7.2. Code Execution Pipeline

```
[Student clicks Run / submits Exam]
             |
             v
[POST /api/v1/student/exams/:id/run-code  OR  POST /api/v1/student/exams/:id/submit]
             |
             v
[Fetch test cases from DB (public only for run-code; all for submit)]
             |
             v
[If teacher_code set → execute teacher_code → use stdout as expected output]
             |
             v
[Execute student code via Piston API / local fallback]
             |
             v
[Compare outputs with float-tolerance normalization]
             |
             v
[Return per-test-case results: AC / WA / CE / RE / TLE]
```

### 7.3. Output Normalization & Float Tolerance
Before comparing expected and actual output, both strings are normalized:
1. **Whitespace:** Trailing whitespace stripped per line; leading/trailing blank lines trimmed.
2. **Float Tolerance:** All numeric tokens are rounded to 6 significant digits. This absorbs floating-point noise from teacher code (e.g., `440000.0000006` normalizes to `440000`).

Example: `"Áo: 440000.0000006"` and `"Áo: 440000"` compare as equal after normalization.

### 7.4. Execution Result Codes

| Status | Meaning | Score Impact |
| :--- | :--- | :--- |
| **AC** (Accepted) | Output matches expected on all test cases | Full points |
| **WA** (Wrong Answer) | Output does not match | Score scaled by % test cases passed |
| **CE** (Compile Error) | Syntax / import error before execution | 0 points |
| **RE** (Runtime Error) | Non-zero exit code during execution | 0 points for failed cases |
| **TLE** (Time Limit Exceeded) | Execution timed out | 0 points for timed-out cases |

### 7.5. Execution Mode Configuration
Configurable via platform settings:
- **LOCAL_FALLBACK (default):** Tries Piston API first; falls back to local execution.
- **LOCAL_ONLY:** Uses only the local internal execution endpoint.
- **API_ONLY:** Uses only the configured Piston API URL.

---

## 8. REST API Endpoint Catalog

### 8.1. Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | Authenticate, return session cookie |
| POST | `/api/v1/auth/password-reset` | Change password, clear `is_first_login` |

### 8.2. Student Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/api/v1/student/exams` | List available exams |
| POST | `/api/v1/student/exams/:id/start` | Create or resume submission |
| GET | `/api/v1/student/exams/:id/questions` | Fetch questions (with shuffle persistence) |
| GET | `/api/v1/student/exams/:id/draft` | Fetch saved draft answers |
| POST | `/api/v1/student/exams/:id/auto-save` | Persist draft answers |
| POST | `/api/v1/student/exams/:id/run-code` | Execute code against public test cases |
| POST | `/api/v1/student/exams/:id/submit` | Finalize and grade exam |
| POST | `/api/v1/student/exams/:id/exit` | Save & exit (keep submission open) |
| GET | `/api/v1/student/completed` | List completed exam results |
| PUT | `/api/v1/student/update-profile` | Update full name |
| POST | `/api/v1/student/change-password` | Change password |

### 8.3. Teacher Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET/POST | `/api/v1/teacher/exams` | List / create exams |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id` | Get / update / delete exam |
| POST | `/api/v1/teacher/exams/:id/clone` | Clone exam with all questions |
| GET/POST | `/api/v1/teacher/exams/:id/questions` | List / create questions |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id/questions/:qId` | Get / update / delete question |
| POST | `/api/v1/teacher/exams/:id/import-questions` | Bulk import from Excel/CSV |
| GET/POST | `/api/v1/teacher/exams/:id/coding-config` | Get / set code config and test cases |
| GET | `/api/v1/teacher/exams/:id/monitor` | Real-time exam monitoring data |
| GET/POST | `/api/v1/teacher/students` | List students / bulk import |
| DELETE | `/api/v1/teacher/students/:id` | Remove student |
| POST | `/api/v1/teacher/students/:id/reset-password` | Reset student password |
| GET/PUT | `/api/v1/settings` | Get / update platform settings |

### 8.4. Internal Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/api/v1/internal/execute-code` | Worker endpoint for async code grading |

---

## 9. Key Behavioral Specifications

### 9.1. Exam Shuffle Persistence
- When `exam.isShuffled = TRUE`, questions are shuffled **once** on the student's first call to `GET /api/v1/student/exams/:id/questions`.
- The shuffled order (array of question IDs) is saved to `exam_submissions.question_order`.
- On all subsequent calls (e.g., after Save & Exit → Resume), the same order is restored. The student always sees the same question sequence.

### 9.2. Run Result Persistence (Client-Side)
- Execution results from "Run Code" are stored per question ID in a client-side map (`runResults: Record<questionId, result>`).
- Switching to another question and returning still shows the last execution output for the original question.
- Results are reset only when the student runs code again for that question.

### 9.3. Untested Code Warning
- On "Submit Exam" click, the system checks which CODE questions have no run result.
- If any exist, a modal is shown listing the untested questions (number + truncated content, max 2 lines each).
- Options: **"Go Back & Test"** (dismiss modal) or **"Submit Anyway"** (proceed with submission).
- If all CODE questions have been run at least once, submission proceeds without interruption.

### 9.4. Toast Notification System
- All feedback messages (save success, errors, validation failures) appear as slide-in toast pop-ups in the top-right corner.
- Toasts auto-dismiss after 4 seconds; can be manually dismissed.
- Variants: success (green), error (red), warning (amber), info (blue).
- No `alert()` calls or inline static banners anywhere in the UI.

### 9.5. Code Question Visual Identity
- CODE questions in the sidebar question map use **amber/yellow** color in all states.
- QUIZ questions use **brand blue**.
- This allows students to immediately distinguish question types at a glance.

### 9.6. Student Progress Tracking in Monitor
- The monitor SSE stream includes `totalQuestions` (integer) alongside `totalPossibleScore` and `roster`.
- Each roster entry's `details` array lists per-question submissions. `details.length` is the number of questions the student has answered.
- The **Progress** column renders a progress bar: `answered / totalQuestions` with percentage, plus a `✓ N pass / ✗ N fail` breakdown derived from each `detail.result` field.
- Progress updates live on every SSE tick without page refresh.

### 9.7. Dynamic Quiz Score Recomputation
- In both the teacher monitor view (`GET /api/v1/teacher/exams/:id/monitor`) and the student completed-exam view (`GET /api/v1/student/completed/:id`), quiz question scores are **re-derived from selected options at read time** rather than relying solely on the stored `score` value.
- The partial-credit formula mirrors the grader: if any selected option is incorrect, score = 0; otherwise score = `points × (correctSelected / totalCorrect)`.
- Unanswered questions (no selected options) fall back to the stored `score`.
- This guarantees that the displayed score is always consistent with the displayed PASS/FAIL result, even if the stored score was written by an older code path.

---

## 10. Deployment & Infrastructure

### 10.1. Current Stack
- **Frontend + API:** Next.js 14+ (App Router), deployed on Netlify/Vercel
- **Database:** Neon PostgreSQL (serverless), accessed via Drizzle ORM
- **Code Execution:** Piston API (external) with local Express fallback (`/api/v1/internal/execute-code`)
- **Schema Management:** `init.sql` for full reset; `src/db/migrations/` for incremental DDL changes

### 10.2. Running Migrations
Apply incremental schema changes with:
```bash
psql $DATABASE_URL -f src/db/migrations/0001_add_question_order.sql
```

Or full reset from scratch:
```bash
npm run db:setup
```

### 10.3. Environment Variables
| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Secret for session token signing |
| `PISTON_API_URL` | Default Piston API endpoint (overridden by DB settings) |
