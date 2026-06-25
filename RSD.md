# Requirements Specification Document (RSD)
## Enterprise Online Quiz, Hybrid Coding & Automation Testing Platform
**Document Version:** 7.1 (Memory limit removed; stdin UX, vacuous-pass detection, XPATH completed exam display)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

---

## Revision History

### Version 7.1 — 2026-06-25

#### 🆕 New
| Area | Detail |
| :--- | :--- |
| **Stdin injection banner** | Sample Cases tab now shows a persistent info banner explaining that the displayed Input is passed as `stdin` when Run Code is clicked, with language-specific read patterns (`sys.stdin.read()` / `input()` for Python; `fs.readFileSync('/dev/stdin')` / `process.stdin` for JavaScript). |
| **Stdin column labels** | Sample Cases columns renamed from "Input / Expected Output" to "Input (stdin) / Expected Output (stdout)" for clarity. |
| **Editor placeholder boilerplate** | When the code editor is blank, the placeholder text now shows a language-specific stdin-reading template (import/read/parse/print scaffold) instead of a generic comment. |
| **Vacuous-pass detection** | When a student's code runs but prints nothing, and the expected output is also empty (unconfigured), the system now explicitly detects this as a vacuous pass. The Execution Output tab shows an amber **"⚠ No Output Produced"** badge instead of a misleading green "✓ All Passed". |
| **No-output warning banner** | When vacuous pass is detected, a red inline banner appears: *"Your code ran but produced no output. Make sure you print your result using `console.log()` (JavaScript) or `print()` (Python)."* |
| **"Not Graded" state** | When all test cases have no configured expected output (neither `outputData` nor Teacher Reference Code set), the tab badge shows amber **"⚠ Not Graded"** so students and teachers understand the result is not meaningful. |
| **`expectedOutputConfigured` flag** | The `ExecutionResult` object now carries an `expectedOutputConfigured: boolean` field so the frontend can distinguish "empty because not configured" from "intentionally empty". |
| **`inputData` in execution result** | `ExecutionResult` now carries `inputData: string` (the actual stdin passed to the process). The frontend reads this directly instead of doing fragile index-based lookups on `publicCases[i]`. |
| **Teacher Reference Code UI** | Teacher coding config page now shows a textarea for **Teacher Reference Code** with an amber warning banner when active: *"Reference code is active. Expected output in test cases below will be ignored during grading."* |
| **Starter Code UI** | Teacher coding config page now shows a textarea for **Starter Code** (boilerplate pre-loaded into student editor on first open). |
| **XPATH in completed exam view** | The student completed exam detail drawer now renders XPATH question results, showing the student's submitted XPath expression in an emerald-styled code block alongside the AC/WA result badge. |
| **XPATH in completed exam API** | `GET /api/v1/student/completed/:id` now includes `studentXpath` in each `submission_detail` row. Previously the field was in the DB but never selected. |

#### 🔄 Changed
| Area | Detail |
| :--- | :--- |
| **Question type badge colors** | Standardised across all views: `QUIZ` = Blue/Brand, `CODE` = Amber, `XPATH` = Emerald. The completed exam drawer previously used incorrect colours for CODE and XPATH badges. |
| **Sample Cases layout** | Each test case is now displayed as a full-width stacked card (vertical rows) with a 2-column grid (Input | Expected Output) inside. Previously cases were shown in a horizontal `flex` row which caused layout issues on long inputs. |
| **Question header sizing** | The CODE question header in the student workspace was reduced (`p-8 → p-4`, `text-xl → text-sm`, `mb-8 → mb-4`) to give more vertical space to the editor and bottom panel. |
| **Editor height** | Reduced from `h-[600px]` to `h-[540px]` and font from `text-[15px]` to `text-[13px]` to improve fit on smaller screens. |
| **Bottom panel height** | Increased from `h-52` to `h-72` so more test case results are visible without scrolling. |
| **Execution Output "Expected" column** | Now shows `"not configured"` (amber) when `outputData` is empty and no Teacher Reference Code is set, instead of `"(empty)"`, making the cause clear. |
| **Coding config saved fields** | Teacher Reference Code (`teacherCode`) and Starter Code (`starterCode`) are now fully saved and returned by `GET/POST /api/v1/teacher/exams/:id/coding-config`. Previously these columns existed in the DB but the API never read or wrote them. |
| **Section 5.3 coding config spec** | Replaced the single-sentence description with a full table showing each configurable field, whether it is enforced, and its purpose. |
| **Section 7.2 execution pipeline** | Expanded with a 4-step flow covering stdin injection, stdout comparison, vacuous-pass detection, and time limit enforcement. |
| **Section 9 behavioural specs** | Expanded from 4 to 9 items covering vacuous-pass, stdin injection, starter code pre-fill, memory limit removal, and XPATH completed exam display. |

#### ❌ No Longer
| Area | Detail |
| :--- | :--- |
| **Memory Limit field (UI)** | Removed from the Teacher Coding Config page and the Question Builder (add/edit question form). The field showed a KB value that was never applied to code execution. |
| **Memory Limit in APIs** | `memoryLimit` is no longer read, written, or returned by: `POST/GET /api/v1/teacher/exams/:id/coding-config`, `POST /api/v1/teacher/exams/:id/questions`, `PUT /api/v1/teacher/exams/:id/questions/:id`, `POST /api/v1/teacher/exams/:id/clone`. |
| **`memoryLimitKb` in executor** | Removed from the `CodeExecutionRequest` interface in `code-executor.ts`. The Piston API call no longer sends `run_memory_limit`. |
| **Memory Limit in run/submit/force-submit** | `run-code`, `submit`, `force-submit`, and `execute-code` API routes no longer pass `memoryLimitKb` to `executeCode()`. |
| **Index-based public case lookup** | The frontend no longer uses `publicCases[i]` to retrieve the input for a result row. Input comes directly from `r.inputData` in the execution result. |
| **`run_memory_limit: -1` Piston param** | Removed from the Piston API payload. Piston's default (unlimited) applies. |

> **Note on `memory_limit` DB column:** The column still exists in the `code_configs` table and retains its default value (`65536`). No migration is required. It is simply ignored at runtime.

---

## 1. System Overview & Scope

### 1.1. Purpose
The Online Quiz and Coding Practice Platform is a unified web-based assessment application designed to automate theoretical, practical programming, and UI automation (XPath) examinations. The platform minimizes manual grading overhead, implements strict academic integrity controls, and delivers real-time monitoring and analytics to instructors.

### 1.2. High-Level System Architecture
The platform is built on a Next.js full-stack architecture with API routes handling business logic and a PostgreSQL database (via Drizzle ORM) as the primary datastore.

```text
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
          |                      |                       |                    |
          v                      v                       v                    v
+--------------------+  +--------------------+  +-------------------+  +-----------------------+
| PRIMARY DATASTORE  |  |   CODE EXECUTION   |  | XPATH EVALUATION  |  |  INTERNAL WORKERS     |
| Neon PostgreSQL    |  |   Piston API /     |  | Shared JSDOM      |  |  /api/v1/internal/    |
| (Drizzle ORM)      |  |   Local Fallback   |  | Engine (Backend)  |  |  execute-code         |
+--------------------+  +--------------------+  +-------------------+  +-----------------------+
```

---

## 2. User Roles, Authentication & Permissions

### 2.1. Role Definitions
- **Teacher (Evaluator):** Administers exams, designs question banks, configures test cases and runtime limits, registers student cohorts, monitors live sessions, and reviews grading reports.
- **Student (Candidate):** Authenticates via instructor-provisioned credentials, participates in scheduled exam sessions, writes code, selects quiz answers, tests XPath locators, and reviews results after submission.

### 2.2. Enforced Authentication & First-Time Lifecycle
Self-registration is disabled. All student credentials are provisioned by the teacher via CSV/Excel import.

#### Lifecycle Phase 1: Account Seeding
Instructor uploads CSV/Excel with: `student_id`, `full_name`, `email`.

#### Lifecycle Phase 2: Access Interception
On `POST /api/v1/auth/login`, if `is_first_login` is `TRUE`, the API returns a `FORCE_PASSWORD_RESET` status. The system forces the student to create a new password meeting strict complexity requirements (`>=8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special`). Backend updates password hash, sets `is_first_login = FALSE`, and redirects to dashboard.

### 2.3. Role Permissions & Action Matrix
To enforce strict data boundaries, the platform utilizes a rigid Role-Based Access Control (RBAC) model verified via JWT middleware.

**Legend:**
*   **✅ Full Access**
*   **👀 View Only**
*   **👤 Self Only** (Can only perform action on own data/assigned exams)
*   **❌ No Access** (`403 Forbidden`)

| System Module & Action | Teacher (Evaluator) | Student (Candidate) |
| :--- | :---: | :---: |
| **1. Identity & Account Lifecycle** | | |
| Login & Authenticate via Session Token | ✅ Full Access | ✅ Full Access |
| Force First-Login Password Reset Flow | ❌ No Access | 👤 Self Only |
| Update Personal Profile & Password | 👤 Self Only | 👤 Self Only |
| Bulk Import Student Accounts | ✅ Full Access | ❌ No Access |
| **2. Exam Management** | | |
| Create, Update, Delete, Clone Exams | ✅ Full Access | ❌ No Access |
| Configure Exam Access (ALL / RESTRICTED)| ✅ Full Access | ❌ No Access |
| View Available / Assigned Exams | 👀 View Only | 👤 Self Only |
| **3. Question Bank & Test Configurations** | | |
| Create/Edit/Delete QUIZ, CODE, XPATH | ✅ Full Access | ❌ No Access |
| Configure Hidden vs. Public Test Cases | ✅ Full Access | ❌ No Access |
| Run "Verify Configuration" for Code/XPath | ✅ Full Access | ❌ No Access |
| View Question Content & Public Test Cases | ✅ Full Access | 👀 View Only *(During Exam)* |
| **4. Live Exam Workspace & Execution** | | |
| Start / Resume Exam Session | ❌ No Access | 👤 Self Only |
| Execute Sandbox (Run Code / Run XPath) | ❌ No Access | 👤 Self Only |
| Submit Final Exam & Acknowledge Warnings| ❌ No Access | 👤 Self Only |
| **5. Live Monitoring & Auto-Grading** | | |
| Access Real-Time SSE Monitor Dashboard | ✅ Full Access | ❌ No Access |
| Force-Submit an Active Student's Exam | ✅ Full Access | ❌ No Access |
| View Final Grades & Execution Results | ✅ Full Access | 👤 Self Only |
| View Hidden Test Case Results | ✅ Full Access | ❌ No Access |
| **6. Global Platform Settings** | | |
| Configure Piston API Sandbox & Focus Modes| ✅ Full Access | ❌ No Access |

---

## 3. Security, Monitoring & Anti-Cheat Subsystem

### 3.1. Client-Side Telemetry & Event Hooks
- **Focus Loss Tracker:** Monitors `blur` events. Each focus loss increments the counter and displays an on-screen warning.
- **Session IP Binding (configurable):** Client IP is recorded at submission start. Platform settings allow enabling/disabling enforcement.

### 3.2. Network Interruption & Session Resilience
- **Auto-Save Engine:** Drafts (code, xpath, and quiz selections) are automatically synced to the database every N seconds (configurable in platform settings, default 15s).
- **Resume on Re-entry:** Drafts are restored from the database via `GET /api/v1/student/exams/:id/draft`.
- **Shuffle Order Persistence:** `isShuffled = TRUE` randomizes order on first load, saves to `exam_submissions.question_order`, and persists exactly on all subsequent loads.

### 3.3. Exam Monitoring (Teacher)
The monitor dashboard (`GET /api/v1/teacher/exams/:id/monitor`) provides real-time SSE session states including Focus Losses, Progress, Score, and active status.

---

## 4. Candidate Workspace Interface Design

### 4.1. Global Exam Wrapper
```text
+---------------------------------------------------------------------------------+
| [Logo] Exam Session                                        [ TIMER: 01:24:15 ]  |
| [ Save & Exit ]  [ Submit Exam ]                                                |
+-----------------------------------+---------------------------------------------+
|  Questions Map                    |                                             |
|                                   |           ACTIVE WORKSPACE                  |
|  [1][2][3]     ← QUIZ (blue)     |                                             |
|  [4][5]        ← CODE (yellow)   |                                             |
|  [6][7]        ← XPATH (green)   |                                             |
+-----------------------------------+---------------------------------------------+
```

### 4.2. Mode A: Quiz View (Blue)
- Displays question text and selectable option cards (radio for single, checkbox for multiple correct).

### 4.3. Mode B: Integrated Code Editor (Amber/Yellow)
- Full-height code editor with language selector (Python 3 / JavaScript).
- Editor placeholder shows language-specific stdin-reading boilerplate when no code has been entered.
- Bottom panel with **Sample Cases** and **Execution Output** tabs.
- **Sample Cases tab:** Displays each public test case as a full-width card with two columns: **Input (stdin)** and **Expected Output (stdout)**. A banner at the top of the tab explains that the displayed input is passed as `stdin` when the student clicks Run Code, and shows the correct language-specific read pattern (`sys.stdin.read()` for Python; `fs.readFileSync('/dev/stdin')` for JavaScript).
- **Run Code button:** Executes code against public test cases. Untested code throws a warning modal on exam submission.
- **Execution Output tab:**
  - If student code produced no stdout, shows an amber "⚠ No Output Produced" badge and a red inline banner: *"Your code ran but produced no output. Make sure you print your result using `console.log()` (JavaScript) or `print()` (Python)."*
  - If expected output was never configured, shows an amber "⚠ Not Graded" badge instead of a green pass badge.
  - Real passes (student output matches expected output) show a green "✓ All Passed" badge with per-case AC indicators.
  - Each result row shows: **Input**, **Expected**, **Your Output**, execution time, and any stderr.

### 4.4. Mode C: XPath Automation Workspace (Emerald/Green)
- **Split-Pane Layout:**
  - **Left Pane (Target Preview):** An `<iframe>` displaying the target URL, or a read-only syntax-highlighted block for raw HTML snippets.
  - **Right Pane:** Question description and a single-line input field for the `student_xpath`.
- **Test Locator Button:** Executes the XPath against the target.
- **Output Console:** Shows AC/WA/CE status and renders a truncated list of `outerHTML` snippets showing exactly what elements the student's XPath selected.

### 4.5. UI Notification & Confirmation Systems
- All user-facing feedback is delivered as slide-in toast pop-ups (auto-dismiss after 4s). No inline banners or `alert()` dialogs.
- Destructive actions use a styled `ConfirmModal` component instead of the browser-native `confirm()` API.

---

## 5. Evaluator/Teacher Management Panel & Data Ingestion

### 5.1. Exam Management
- Create, edit, delete, and clone exams. RESTRICTED access allows assigning specific students.

### 5.2. Question Builder
**Supported Question Types:**
- `QUIZ`: Multiple choice (single/multiple correct).
- `CODE`: Programming task with starter code, reference code, limits, and test cases.
- `XPATH`: UI Automation task targeting a URL or HTML snippet with a reference locator.

### 5.2.1. Question Import
Teachers can download a CSV/Excel template and bulk-import questions into an exam via file upload. The template endpoint (`GET /api/v1/teacher/questions/template`) returns the file, and the import is handled by `POST /api/v1/teacher/exams/:id/import-questions`.

### 5.3. Coding Task Configuration
Teachers configure the following fields for each CODE question. **Every field saved here is enforced at runtime** — no cosmetic-only settings exist.

| Field | Enforced | Description |
| :--- | :---: | :--- |
| **Time Limit (ms)** | ✅ | Student process is killed (TLE) if it exceeds this duration. Default: 1000 ms. |
| **Starter Code** | ✅ | Pre-filled boilerplate loaded into the student's editor on first open. If blank, the editor shows language-specific stdin-reading placeholder text. |
| **Teacher Reference Code** | ✅ | If provided, the system runs this code against each test case input at grading time to generate expected output dynamically. Overrides the "Expected Output" column in test cases. An amber warning banner appears in the UI when active. |
| **Test Cases** | ✅ | Each test case has **Standard Input** (passed as stdin to the student's code), **Expected Output** (compared to stdout), and a **Hidden** flag (hidden cases are evaluated on submit but not shown in the Sample Cases tab). |

> **Memory Limit has been removed.** It was previously a configurable field but was never enforced by the execution engine. It has been removed from the UI and all API routes to eliminate misleading configuration.

### 5.4. XPath Task Configuration
Teachers configure:
- **Target Type:** `URL` or `Raw HTML Snippet`.
- **Target Payload:** The actual URL or HTML string.
- **Reference XPath:** The correct locator.
- **Verify Configuration Action:** A required pre-flight check to test that the target URL is reachable and the reference XPath successfully selects elements before saving.

---

## 6. Database Schema

### 6.1. Entity Relationship Overview

```text
   +------------------+         +------------------+         +----------------------+
   |      users       |         |      exams       |         |   exam_submissions   |
   +------------------+         +------------------+         +----------------------+
   | PK id (UUID)     |<--------| FK created_by    |         | PK id (UUID)         |
   |    ...           |         |    ...           |         | FK student_id        |
   +------------------+         +------------------+         |    question_order    |
                                         |                   +----------------------+
                                         v
                                +------------------+
                                |    questions     |
                                +------------------+
                                | PK id (UUID)     |
                                |    type (Enum)   | -- 'QUIZ', 'CODE', 'XPATH'
                                +------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+          +--------------------+         +--------------------+
|   quiz_options   |          |    code_configs    |         |    xpath_configs   |
+------------------+          +--------------------+         +--------------------+
                              | FK question_id     |         | FK question_id     |
                              |    time_limit      |         |    target_type     |
                              |    starter_code    |         |    target_payload  |
                              |    teacher_code    |         |    reference_xpath |
                              | *memory_limit (DB  |         +--------------------+
                              |  col, not enforced)|
                              +--------------------+
                                         |
                              +--------------------+
                              |    test_cases      |
                              +--------------------+
```

---

## 7. Automatic Grading Architecture

### 7.1. Quiz Auto-Grading
Proportional partial credit. If any selected option is incorrect, score = 0.

### 7.2. Code Execution Pipeline
Code is run via Piston API/Local Fallback. Outputs are compared using float-tolerance normalization (e.g., `440000.0000006` == `440000`). Supports AC / WA / CE / RE / TLE status codes.

**Execution flow:**
1. Test case `inputData` is written to the child process's **stdin** before the process starts. Students must read from stdin to receive the input (e.g., `sys.stdin.read()` in Python, `fs.readFileSync('/dev/stdin')` in JavaScript).
2. The process's **stdout** is captured and compared against `outputData` (or the Teacher Reference Code's output if configured).
3. If the student's code exits without printing anything, stdout is `""`. If the expected output is also `""` (unconfigured), the grader would naively return AC — this is called a **vacuous pass** and is explicitly detected and displayed as "⚠ No Output Produced" (amber) rather than a green pass badge.
4. The Time Limit is the only resource constraint enforced. The process is killed with SIGTERM/SIGKILL on timeout → TLE status.

### 7.3. XPath Shared DOM Evaluation
Unlike code execution, XPath verification does not require an isolated container. It relies on a **Shared Virtual DOM Architecture**.
1. Backend fetches the `target_payload` and loads it into a single `jsdom` instance.
2. The **Teacher's Reference XPath** is evaluated to get a NodeList.
3. The **Student's Input XPath** is evaluated to get a NodeList.
4. If lengths match and exact DOM node memory references perfectly align, the system awards full points (AC).

**Security Constraints:**
- **SSRF Protection:** Fetch requests aggressively block internal network IPs (`127.0.0.1`, `10.x.x.x`, `169.254.169.254`).
- **Timeouts:** 5-second strict timeout on target HTML fetches.

---

## 8. REST API Endpoint Catalog

### 8.1. Auth Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | Authenticate user; returns `FORCE_PASSWORD_RESET` on first login |
| POST | `/api/v1/auth/password-reset` | Reset password using a reset token |

### 8.2. Student Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET | `/api/v1/student/exams` | List available / assigned exams |
| POST | `/api/v1/student/exams/:id/start` | Create or resume an exam submission session |
| GET | `/api/v1/student/exams/:id/questions` | Fetch questions (with shuffle persistence) |
| GET | `/api/v1/student/exams/:id/draft` | Restore saved draft answers |
| POST | `/api/v1/student/exams/:id/auto-save` | Persist draft answers (Quiz, Code) |
| POST | `/api/v1/student/exams/:id/run-code` | Execute code against public test cases |
| POST | `/api/v1/student/exams/:id/run-xpath` | Evaluate XPath against target DOM |
| POST | `/api/v1/student/exams/:id/submit` | Finalize and grade exam |
| POST | `/api/v1/student/exams/:id/exit` | Save draft and exit exam without submitting |
| GET | `/api/v1/student/completed` | List completed/submitted exams |
| GET | `/api/v1/student/completed/:id` | Get detailed result for a completed exam |
| PUT | `/api/v1/student/update-profile` | Update student's own profile (name, email) |
| POST | `/api/v1/student/change-password` | Change student's own password |

### 8.3. Teacher Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET/POST | `/api/v1/teacher/exams` | List all exams / create a new exam |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id` | Get, update, or delete an exam |
| POST | `/api/v1/teacher/exams/:id/clone` | Clone an existing exam |
| GET/POST | `/api/v1/teacher/exams/:id/questions` | List / create questions |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id/questions/:questionId` | Get, update, or delete a specific question |
| GET/POST | `/api/v1/teacher/exams/:id/coding-config` | Get / set code config and test cases |
| GET/POST | `/api/v1/teacher/exams/:id/xpath-config` | Get / set XPath config and verify payload |
| POST | `/api/v1/teacher/exams/:id/import-questions` | Bulk import questions from CSV/Excel template |
| GET | `/api/v1/teacher/exams/:id/monitor` | Real-time SSE exam monitoring |
| POST | `/api/v1/teacher/exams/:id/force-submit` | Force-submit and grade an active student's exam |
| GET/POST | `/api/v1/teacher/students` | List students / bulk import |
| GET/PUT | `/api/v1/teacher/students/:id` | Get or update a specific student |
| POST | `/api/v1/teacher/students/:id/reset-password` | Reset a student's password |
| GET | `/api/v1/teacher/students/:id/exams` | Get exam assignments for a student |
| POST | `/api/v1/teacher/students/bulk-create` | Bulk create students from CSV/Excel |
| GET | `/api/v1/teacher/questions/template` | Download the question import template file |
| GET/PUT | `/api/v1/settings` | Get / update global platform settings |

---

## 9. Key Behavioral Specifications

1. **Exam Shuffle Persistence:** Shuffled order is generated once per student and persisted to `exam_submissions.question_order` for resume stability.
2. **Untested Code Warning:** If any `CODE` question lacks a run result at submission time, a modal requires the student to "Go Back & Test" or "Submit Anyway".
3. **Dynamic Quiz Score Recomputation:** In monitor/result views, quiz scores are re-derived from selected options at read time to guarantee consistency with the displayed PASS/FAIL UI badge.
4. **Question Type Visual Identity:** `QUIZ` = Blue/Brand, `CODE` = Amber, `XPATH` = Emerald Green — applied consistently across question maps, UI badges, and completed exam result drawers.
5. **Vacuous Pass Detection:** When both `actualOutput` and `expectedOutput` are empty strings after a code run, the result is flagged as a vacuous pass. The Execution Output tab displays an amber "⚠ No Output Produced" badge instead of a green "✓ All Passed", and a red banner advises the student to add a `print()` or `console.log()` call.
6. **Stdin Input Injection:** When Run Code is triggered, each test case's `inputData` is written to the student code process's stdin before execution begins. The Sample Cases tab displays a banner explaining this and showing the language-appropriate stdin-reading pattern.
7. **Starter Code Pre-fill:** If a Teacher Reference Code or Starter Code is configured for a CODE question, the starter code is pre-loaded into the student's editor on first open. On subsequent opens, the student's saved draft takes priority.
8. **No Memory Limit Enforcement:** Memory limit is not enforced by the platform. Only the Time Limit is a hard constraint on code execution.
9. **XPATH Completed Exam Display:** The completed exam detail view renders XPATH question results with the student's submitted XPath expression shown in an emerald-styled code block, alongside AC/WA status from grading.

---

## 10. Deployment & Infrastructure
- **Frontend + API:** Next.js 14+ (App Router), Node.js 18+ runtime
- **Database:** Neon PostgreSQL (serverless) accessed via Drizzle ORM
- **Migrations:** Applied via `npm run db:setup` or `psql` executing `src/db/migrations/*.sql`
- **Code Sandbox:** External Piston API or local Express fallback worker.

--- END OF FILE RSD.md ---