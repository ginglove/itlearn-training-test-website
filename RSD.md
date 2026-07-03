# Requirements Specification Document (RSD)
## Enterprise Online Quiz, Hybrid Coding & Automation Testing Platform
**Document Version:** 7.3 (Active-time timer, Pending/Cancelled submission statuses, responsive workspace)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

---

## Revision History

### Version 7.3 — 2026-07-01

#### 🆕 New
| Area | Detail |
| :--- | :--- |
| **`active_seconds` on submissions** | New `integer NOT NULL DEFAULT 0` column on `exam_submissions`. Accumulates only the seconds the student had the workspace open — excludes time between Save & Exit and re-entry. Migration: `0006_active_seconds.sql`. |
| **`SAVE_AND_EXIT` close reason** | When a student exits via **Save & Exit** the submission's `close_reason` is set to `"SAVE_AND_EXIT"`. On re-entry (`GET /api/v1/student/exams/:id/questions`) it is cleared back to `null` so the student appears **IN_PROGRESS** while in the workspace. |
| **4-state Submission Status** | All monitors, session lists, and student completed views now derive a `submissionStatus` field: `SUBMITTED` (graded), `IN_PROGRESS` (active workspace), `PENDING` (Save & Exit, exam still open), or `CANCELLED` (exam window closed, never submitted). |
| **Active-time-based countdown timer** | The student workspace timer no longer counts down from `startAt` wall-clock time. It counts down from `duration − activeSeconds` (time actually spent in the workspace). This means pausing via Save & Exit preserves the remaining time correctly across re-entries. |
| **Mobile questions-map toggle** | A hamburger button in the workspace header (visible only on mobile / `< md`) toggles the questions-map sidebar overlay on small screens. |

#### 🔄 Changed
| Area | Detail |
| :--- | :--- |
| **`GET /api/v1/student/exams/:id/questions`** | Now additionally returns `activeSeconds` (seconds already spent in prior sessions) and `examDurationMins` (exam duration in minutes), so the workspace can compute remaining time without relying on `sessionStorage`. Also clears `closeReason` on re-entry. |
| **`POST /api/v1/student/exams/:id/exit`** | Now accepts `activeSeconds` in the request body and persists it to `exam_submissions.active_seconds` alongside setting `close_reason: "SAVE_AND_EXIT"`. |
| **Monitor Dashboard** (`/teacher/exams/:id/monitor`) | Now shows **Pending** (amber) and **Cancelled** (red) summary counters in addition to In-Progress and Submitted. Student rows display `Pending` badge (with Force Submit button) and `Cancelled by System` badge based on `submissionStatus`. Previously only checked `submittedAt`. |
| **Teacher Sessions page** | `ResultBadge` now renders **PENDING** (amber) and **CANCELLED** (red) states. Session header shows `Pending` and `Cancelled` stat pills. In-Progress pill changed to blue. |
| **Student Completed Exams table** | `Incomplete` column split into two: **Pending** (amber badge) and **Cancelled** (red badge). API field `totalIncomplete` replaced by `totalPending` + `totalCancelled`. |
| **`GET /api/v1/student/exam-groups`** | Replaced `totalIncomplete` aggregate with separate `totalPending` and `totalCancelled` counts using the same status logic (compares `closeReason` and `exams.endTime`). |
| **`GET /api/v1/teacher/exams/:id/monitor`** | Fetches `exams.endTime` and derives `submissionStatus` per student; includes `closeReason` in the submission query. |
| **`GET /api/v1/teacher/sessions`** | Per-student records include `submissionStatus`. Session aggregates include `totalPending` and `totalCancelled`. |
| **Time's Up overlay** | Prioritizes showing the graded result first if available; spinner only shown if still submitting. Eliminates the previous race condition where the overlay could show an infinite spinner after grading completed. |
| **Trend chart (Completed Exams)** | Wider viewBox (`H=160`, `RIGHT=60`), pass-line label moved to right side, score % labels clamped above dots, attempt number row added below data points. |
| **Focus-loss auto-submit guard** | Auto-submit on 3rd focus-loss in `WARN_AND_LOCK` mode is now gated on `questions.length > 0` to prevent a spurious submit before questions have loaded. |

#### 🗑️ Removed / Superseded
| Area | Detail |
| :--- | :--- |
| **Wall-clock timer** | Timer no longer derives remaining time from `startAt + duration`. Replaced by `activeSeconds`-based countdown. `sessionStorage` duration key is still read as a fallback if the API does not return `examDurationMins`. |
| **`totalIncomplete` field** | Removed from `exam-groups` API and student Completed Exams table. Replaced by `totalPending` + `totalCancelled`. |

---

### Version 7.2 — 2026-06-26

#### 🆕 New
| Area | Detail |
| :--- | :--- |
| **OFE execution status** | New status code `OFE` (Output Limit Exceeded) added to `execution_status` enum. Triggered when a student program produces more than **10,000 characters** of stdout, preventing memory/network overload from runaway print loops. |
| **256 MB memory hard cap** | Every code execution request now sends `run_memory_limit: 262144` to the Piston API, capping each sandbox at 256 MB. Prevents host-level OOM from infinite allocation loops. |
| **Focus Loss Enforcement Policy** | Per-exam setting: `LOG_ONLY` (default) or `WARN_AND_LOCK`. In `WARN_AND_LOCK` mode, the 1st and 2nd tab-switch offenses show the student a modal warning; the 3rd offense triggers an immediate, un-bypassable auto-submit flagged with `close_reason: "FOCUS_LOSS_THRESHOLD"`. |
| **`focus_loss_policy` on exams** | New column on `exams` table (varchar 20, default `"LOG_ONLY"`). Set per-exam via the exam creation form. |
| **`close_reason` on submissions** | New nullable column on `exam_submissions` (varchar 50). Set to `"FOCUS_LOSS_THRESHOLD"` on auto-submit from focus-loss enforcement. Null on normal or teacher-forced submissions. |
| **CSS Selector support** | XPath questions now support two selector types: `XPATH` (XPath 1.0) and `CSS` (CSS Selector via `querySelectorAll`). The teacher picks the type per question; students write the corresponding expression. |
| **XPath test cases (one-to-many)** | New `xpath_test_cases` table replaces the single-config approach in `xpath_configs`. Each XPATH question can have multiple test cases (each with its own target type, target payload, reference selector, and hidden flag), mirroring how `CODE` questions work. |
| **Hidden XPath test cases** | XPath test cases can be marked hidden. Hidden cases are excluded from the "Run XPath" response but included in final grading at submission, identical to hidden CODE test cases. |
| **Inline XPATH config in question builder** | Teachers now configure XPath test cases directly inside the question creation/edit form — no separate "XPath Config" page required. Each test case has its own **Verify** button. |
| **Per-test-case Verify button** | New `POST /api/v1/teacher/exams/:id/xpath-verify` endpoint. Evaluates a single (selectorType, targetType, targetPayload, referenceSelector) tuple and returns match count + up to 5 HTML snippets for teacher review. Verification is advisory — it never blocks saving. |
| **XPath 1.0 constraint notice in UI** | An amber info banner on the XPath config page warns teachers that the backend evaluator (jsdom) supports only **XPath 1.0**. XPath 2.0/3.0 functions cause a parse error. |

#### 🔄 Changed
| Area | Detail |
| :--- | :--- |
| **`xpath_configs` schema** | Now stores only `selector_type` (XPATH or CSS). The old `target_type`, `target_payload`, and `reference_xpath` columns have been migrated to `xpath_test_cases`. |
| **`GET /api/v1/student/exams/:id/questions`** | Now returns `focusLossPolicy` alongside questions so the workspace can enforce the exam's anti-cheat policy. |
| **`POST /api/v1/student/exams/:id/submit`** | Now accepts optional `close_reason` in the body and persists it to `exam_submissions`. |
| **`POST /api/v1/teacher/exams`** | Now accepts and saves `focusLossPolicy` when creating an exam. |
| **XPath grading** | `gradeXPathQuestion()` now receives an array of test cases (not a single config), evaluates each independently, and returns per-case results + `scorePercentage`. Score = (passed / total) × points. |
| **`run-xpath` student endpoint** | Returns per-case results for visible test cases plus `hiddenCount`. |
| **RSD §7.2 execution pipeline** | Steps 4–6 added: memory cap, OFE detection, time limit. |
| **RSD §7.3 XPath evaluation** | XPath 1.0 constraint formally documented. CSS selector path added. |
| **RSD §3.1 Focus Loss Tracker** | Expanded with full `LOG_ONLY` / `WARN_AND_LOCK` enforcement specification. |

#### 🗑️ Removed / Superseded
| Area | Detail |
| :--- | :--- |
| **Separate "XPath Config" page** | Teachers no longer need to navigate to a separate `/teacher/exams/:id/xpath` page to set up test cases. Configuration is now inline in the question builder. |
| **Single-config XPath approach** | The old model (one URL + one reference XPath per question) is replaced by the multi-test-case model with optional hidden cases. |

---

### Version 7.1 — 2026-06-25

#### 🆕 New
| Area | Detail |
| :--- | :--- |
| **Stdin injection banner** | Sample Cases tab now shows a persistent info banner explaining stdin read patterns. |
| **Vacuous-pass detection** | When student code produces no output and expected output is also empty, shown as amber "⚠ No Output Produced" instead of misleading green pass. |
| **Teacher Reference Code UI** | Textarea for reference code with active-warning banner. |
| **Starter Code UI** | Textarea for boilerplate pre-loaded into student editor. |
| **XPATH completed exam view** | Completed exam drawer now renders XPATH results with student's submitted selector in emerald code block. |

#### 🔄 Changed
| Area | Detail |
| :--- | :--- |
| **Memory Limit field removed from UI** | Never enforced; removed from all forms and APIs. DB column `memory_limit` retained with default but ignored at runtime. |
| **Question type badge colors** | Standardised: QUIZ = Blue, CODE = Amber, XPATH = Emerald. |

---

## 1. System Overview & Scope

### 1.1. Purpose
The Online Quiz and Coding Practice Platform is a unified web-based assessment application designed to automate theoretical, practical programming, and UI automation (XPath/CSS) examinations. The platform minimizes manual grading overhead, implements strict academic integrity controls, and delivers real-time monitoring and analytics to instructors.

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
- **Student (Candidate):** Authenticates via instructor-provisioned credentials, participates in scheduled exam sessions, writes code, selects quiz answers, tests XPath/CSS locators, and reviews results after submission.

### 2.2. Enforced Authentication & First-Time Lifecycle
Self-registration is disabled. All student credentials are provisioned by the teacher via CSV/Excel import.

#### Lifecycle Phase 1: Account Seeding
Instructor uploads CSV/Excel with: `student_id`, `full_name`, `email`.

#### Lifecycle Phase 2: Access Interception
On `POST /api/v1/auth/login`, if `is_first_login` is `TRUE`, the API returns a `FORCE_PASSWORD_RESET` status. The system forces the student to create a new password meeting strict complexity requirements (`>=8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special`). Backend updates password hash, sets `is_first_login = FALSE`, and redirects to dashboard.

### 2.3. Role Permissions & Action Matrix

**Legend:** ✅ Full Access · 👀 View Only · 👤 Self Only · ❌ No Access

| System Module & Action | Teacher (Evaluator) | Student (Candidate) |
| :--- | :---: | :---: |
| **1. Identity & Account Lifecycle** | | |
| Login & Authenticate via Session Token | ✅ | ✅ |
| Force First-Login Password Reset Flow | ❌ | 👤 |
| Update Personal Profile & Password | 👤 | 👤 |
| Bulk Import Student Accounts | ✅ | ❌ |
| **2. Exam Management** | | |
| Create, Update, Delete, Clone Exams | ✅ | ❌ |
| Configure Exam Access (ALL / RESTRICTED) | ✅ | ❌ |
| Configure Focus Loss Policy per Exam | ✅ | ❌ |
| View Available / Assigned Exams | 👀 | 👤 |
| **3. Question Bank & Test Configurations** | | |
| Create/Edit/Delete QUIZ, CODE, XPATH questions | ✅ | ❌ |
| Configure Hidden vs. Public Test Cases | ✅ | ❌ |
| Run per-test-case Verify (XPath/CSS) | ✅ | ❌ |
| View Question Content & Public Test Cases | ✅ | 👀 *(During Exam)* |
| **4. Live Exam Workspace & Execution** | | |
| Start / Resume Exam Session | ❌ | 👤 |
| Execute Sandbox (Run Code / Run XPath) | ❌ | 👤 |
| Submit Final Exam & Acknowledge Warnings | ❌ | 👤 |
| **5. Live Monitoring & Auto-Grading** | | |
| Access Real-Time SSE Monitor Dashboard | ✅ | ❌ |
| Force-Submit an Active Student's Exam | ✅ | ❌ |
| View Final Grades & Execution Results | ✅ | 👤 |
| View Hidden Test Case Results | ✅ | ❌ |
| **6. Global Platform Settings** | | |
| Configure Piston API, Focus Tracking, Auto-Save | ✅ | ❌ |

---

## 3. Security, Monitoring & Anti-Cheat Subsystem

### 3.1. Client-Side Telemetry & Event Hooks

**Focus Loss Tracker**

The workspace listens for window `blur` events (tab switches, alt-tab). Each event increments the `focusLossCount` counter. Behaviour is determined by the per-exam **Focus Loss Policy** set by the teacher at exam creation:

| Policy | Student Experience | Submission Effect |
| :--- | :--- | :--- |
| `LOG_ONLY` *(default)* | No modal shown. Counter visible to teacher on monitor. | `focus_loss_count` recorded on submission. |
| `WARN_AND_LOCK` | **Offense 1 & 2:** Modal warning shown — student must dismiss to continue. **Offense 3:** Immediate, un-bypassable auto-submit. | `close_reason: "FOCUS_LOSS_THRESHOLD"` recorded on the submission record. |

The policy is stored as `focus_loss_policy` on the `exams` table and returned by `GET /api/v1/student/exams/:id/questions` so the workspace can apply it client-side without an additional round-trip.

**Session IP Binding (configurable)**
Client IP is recorded at submission start. Platform settings allow enabling/disabling enforcement.

### 3.2. Network Interruption & Session Resilience
- **Auto-Save Engine:** Drafts (code, xpath/css selector, quiz selections) are automatically synced to the database every N seconds (configurable in platform settings, default 15 s).
- **Resume on Re-entry:** Drafts are restored from the database via `GET /api/v1/student/exams/:id/draft`.
- **Shuffle Order Persistence:** `isShuffled = TRUE` randomizes order on first load, saves to `exam_submissions.question_order`, and restores exactly on all subsequent loads.

### 3.3. Exam Monitoring (Teacher)
The monitor dashboard (`GET /api/v1/teacher/exams/:id/monitor`) provides real-time SSE session states including Focus Losses, Progress, Score, `close_reason`, and active status per student.

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
|  [4][5]        ← CODE (amber)    |                                             |
|  [6][7]        ← XPATH (green)   |                                             |
+-----------------------------------+---------------------------------------------+
```

### 4.2. Mode A: Quiz View (Blue)
Displays question text and selectable option cards (radio for single correct, checkbox for multiple correct).

### 4.3. Mode B: Integrated Code Editor (Amber)
- Full-height code editor with language selector (Python 3 / JavaScript).
- Editor placeholder shows language-specific stdin-reading boilerplate when no code has been entered.
- Bottom panel with **Sample Cases** and **Execution Output** tabs.
- **Sample Cases tab:** Displays each public test case as a card with **Input (stdin)** and **Expected Output (stdout)** columns. A banner explains stdin injection and shows the correct read pattern for each language.
- **Run Code button:** Executes code against public test cases. Untested code triggers a warning modal at submission.
- **Execution Output tab:**
  - `OFE`: Amber "Output Limit Exceeded" badge — student printed more than 10,000 characters.
  - No output: Amber "⚠ No Output Produced" badge + red banner advising `print()` / `console.log()`.
  - Unconfigured expected output: Amber "⚠ Not Graded" badge.
  - Pass: Green "✓ All Passed" badge with per-case AC indicators.

### 4.4. Mode C: XPath / CSS Automation Workspace (Emerald)
- **Question pane:** Displays question description and an input field labelled by selector type (XPath expression or CSS selector).
- **Run XPath / Run CSS button:** Evaluates the student's expression against all visible test cases and shows per-case AC/WA/CE status + matched element count.
- **Output Console:** Shows AC/WA/CE status per test case and renders matched `outerHTML` snippets.
- Hidden test cases are not shown during the session; they are evaluated at final submission.

### 4.5. UI Notification & Confirmation Systems
- All user-facing feedback is delivered as slide-in toast pop-ups (auto-dismiss after 4 s).
- Destructive actions use a styled `ConfirmModal` component.
- Focus-loss warnings (in `WARN_AND_LOCK` mode) use a blocking modal that cannot be dismissed by clicking the backdrop.

---

## 5. Evaluator/Teacher Management Panel & Data Ingestion

### 5.1. Exam Management
- Create, edit, delete, and clone exams.
- **Focus Loss Policy** is set at exam creation (dropdown: `Log Only` / `Warn & Lock`).
- RESTRICTED access allows assigning specific students.

### 5.2. Question Builder
**Supported Question Types:**
- `QUIZ`: Multiple choice (single/multiple correct).
- `CODE`: Programming task with starter code, reference code, time limit, and test cases.
- `XPATH`: UI Automation task with one or more test cases targeting URLs or HTML snippets, using either XPath 1.0 or CSS selectors.

All three types are configured inline in the question creation/edit form. No separate configuration pages are needed.

### 5.2.1. Question Import
Teachers can download a CSV/Excel template and bulk-import questions via `POST /api/v1/teacher/exams/:id/import-questions`.

### 5.3. Coding Task Configuration

| Field | Enforced | Description |
| :--- | :---: | :--- |
| **Time Limit (ms)** | ✅ | Process killed (TLE) if exceeded. Default: 1000 ms. |
| **Starter Code** | ✅ | Pre-filled boilerplate loaded into the student editor on first open. |
| **Teacher Reference Code** | ✅ | Run against each test input at grading time to generate expected output dynamically. Overrides "Expected Output" column. |
| **Test Cases** | ✅ | Each has **Standard Input** (stdin), **Expected Output** (stdout comparison), and a **Hidden** flag. |

> **Memory Limit:** Removed from the UI and API in v7.1 as it was never enforced. A hard 256 MB cap is now applied globally to all executions (see §7.2).

### 5.4. XPath / CSS Automation Task Configuration

Teachers configure XPATH questions inline in the question builder. Each question has:

| Setting | Description |
| :--- | :--- |
| **Selector Type** | `XPATH` (XPath 1.0 expressions) or `CSS` (CSS selectors via `querySelectorAll`). |
| **Test Cases** | One or more test cases, each with its own target, reference selector, and hidden flag. |

Each test case has:

| Field | Description |
| :--- | :--- |
| **Target Type** | `HTML Snippet` — paste rendered HTML from DevTools; or `URL` — fetch the page's raw HTML at evaluation time. |
| **Target Payload** | The HTML string or URL. |
| **Reference Selector** | The correct XPath or CSS expression (teacher's answer key). |
| **Hidden** | If true, excluded from "Run XPath" responses but evaluated at final submission. |
| **Verify button** | Calls `POST /api/v1/teacher/exams/:id/xpath-verify` per test case. Returns match count and up to 5 matched `outerHTML` snippets. Verification is **advisory** — 0 matches shows a warning but never blocks saving. |

> **XPath 1.0 Constraint:** The backend evaluator (jsdom) supports **only XPath 1.0**. Avoid `fn:matches()`, `string-join()`, regex predicates, or any XPath 2.0/3.0 syntax — these will return a parse error at evaluation time. Use CSS selector type for flexible class/attribute matching.

> **JS-Rendered Pages:** jsdom loads static HTML only — JavaScript is not executed. For pages where content is rendered by JavaScript, use **HTML Snippet** mode and paste the rendered HTML from browser DevTools (right-click → Inspect → copy `outerHTML` of the parent container).

---

## 6. Database Schema

### 6.1. Entity Relationship Overview

```text
   +------------------+         +-----------------------------+         +-----------------------------+
   |      users       |         |           exams             |         |      exam_submissions       |
   +------------------+         +-----------------------------+         +-----------------------------+
   | PK id (UUID)     |<--------| FK created_by               |<--------| FK exam_id                  |
   |    username      |         |    title                    |         | FK student_id               |
   |    role          |         |    duration                 |         |    start_at                 |
   +------------------+         |    focus_loss_policy        |         |    submitted_at             |
                                |    access_type (ALL/REST.)  |         |    focus_loss_count         |
                                +-----------------------------+         |    close_reason (nullable)  |
                                                                        |    active_seconds           |
                                            |                           +-----------------------------+
                                            v
                                +------------------+
                                |    questions     |
                                +------------------+
                                | PK id (UUID)     |
                                | FK exam_id       |
                                |    type (Enum)   | -- 'QUIZ', 'CODE', 'XPATH'
                                |    points        |
                                +------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+          +--------------------+         +---------------------+
|   quiz_options   |          |    code_configs    |         |    xpath_configs     |
+------------------+          +--------------------+         +---------------------+
| FK question_id   |          | FK question_id     |         | FK question_id      |
| option_text      |          |    time_limit      |         |    selector_type    |
| is_correct       |          |    starter_code    |         |    (XPATH | CSS)    |
+------------------+          |    teacher_code    |         +---------------------+
                              | *memory_limit (DB  |                   |
                              |  col, not enforced)|                   v
                              +--------------------+         +---------------------+
                                       |                     |  xpath_test_cases   |
                              +--------------------+         +---------------------+
                              |    test_cases      |         | FK question_id      |
                              +--------------------+         |    target_type      |
                              | FK question_id     |         |    target_payload   |
                              |    input_data      |         |    ref_selector     |
                              |    output_data     |         |    is_hidden        |
                              |    is_hidden       |         +---------------------+
                              +--------------------+
```

### 6.2. Enum Types

| Enum | Values |
| :--- | :--- |
| `user_role` | `TEACHER`, `STUDENT` |
| `question_type` | `QUIZ`, `CODE`, `XPATH` |
| `execution_status` | `AC`, `WA`, `CE`, `RE`, `TLE`, `OFE` |

### 6.3. Key Column Notes

| Table | Column | Note |
| :--- | :--- | :--- |
| `exams` | `focus_loss_policy` | `LOG_ONLY` (default) or `WARN_AND_LOCK`. |
| `exam_submissions` | `close_reason` | `NULL` while in workspace; `"SAVE_AND_EXIT"` when student exits without submitting (cleared on re-entry); `"FOCUS_LOSS_THRESHOLD"` on auto-submit from focus-lock enforcement. |
| `exam_submissions` | `active_seconds` | Cumulative seconds the student had the workspace open. Updated on each Save & Exit. Used to compute the countdown timer on resume. |
| `code_configs` | `memory_limit` | DB column retained (default 65536) but **not enforced**. Ignored at runtime. A global 256 MB cap is applied instead (see §7.2). |
| `xpath_configs` | `selector_type` | `XPATH` or `CSS`. Determines which evaluator (`document.evaluate` vs `querySelectorAll`) is used. |

---

## 7. Automatic Grading Architecture

### 7.1. Quiz Auto-Grading
Proportional partial credit. If any selected option is incorrect, score = 0 for that question.

### 7.2. Code Execution Pipeline
Code is executed via Piston API (primary) with a Local Fallback child-process executor. Outputs are compared with float-tolerance normalization (`440000.0000006 == 440000`).

**Status codes:** `AC` · `WA` · `CE` · `RE` · `TLE` · `OFE`

**Execution flow:**
1. Test case `inputData` is written to the child process's **stdin** before the process starts. Students must read from stdin (`sys.stdin.read()` in Python; `fs.readFileSync('/dev/stdin')` in JavaScript).
2. The process's **stdout** is captured and compared against `outputData` (or Teacher Reference Code output if configured).
3. If the student's code exits without printing anything and expected output is also empty, the grader detects a **vacuous pass** and displays "⚠ No Output Produced" (amber) rather than a green pass badge.
4. **Memory Cap:** Every execution request sends `run_memory_limit: 262144` (256 MB) to the Piston API. This prevents host-level OOM from infinite memory allocation loops.
5. **Output Flood Mitigation (OFE):** If `stdout` exceeds **10,000 characters**, execution output is discarded and the test case is marked `OFE`. This prevents megabyte-scale stdout from overloading server memory and the Next.js frontend.
6. **Time Limit:** Enforced via `run_timeout`. Process is killed with SIGTERM/SIGKILL on expiry → `TLE`.

### 7.3. XPath / CSS Shared DOM Evaluation
XPath and CSS grading does not require an isolated container. It uses a **Shared Virtual DOM** via jsdom on the server.

**Evaluation flow:**
1. For each test case, the backend loads `target_payload` into a fresh `jsdom` instance (fetching the URL if `target_type = URL`; parsing raw HTML if `target_type = HTML`).
2. The **Teacher's Reference Selector** is evaluated using the appropriate engine:
   - `XPATH`: `document.evaluate(selector, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)`
   - `CSS`: `doc.querySelectorAll(selector)`
3. The **Student's Selector** is evaluated the same way.
4. If the count of matched elements matches AND each selected node is identical by DOM reference, the test case is `AC`. Otherwise `WA`.
5. Score = (AC test cases / total test cases) × question points.

**Security Constraints:**
- **SSRF Protection:** URL fetch requests block all private/internal network ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`).
- **Fetch Timeout:** 5-second hard timeout on URL target fetches.
- **No JS Execution:** jsdom parses static HTML only. JavaScript within the page is not executed. Teachers should use HTML Snippet mode for JS-rendered content.

**XPath Standard Constraint:**
> Selector evaluations are strictly restricted to the **XPath 1.0 specification standard** due to jsdom's engine limitations. XPath 2.0/3.0 functions — `fn:matches()`, `string-join()`, regex predicates, etc. — are **not supported** and will produce a parse error. Use CSS selector type for flexible class/attribute matching.

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
| GET | `/api/v1/student/exams` | List available / assigned exams; each entry includes `activeAttemptCancelled`, `activeAttemptPaused`, and `activeSeconds` so the UI can show PENDING/CANCELLED states without an extra round-trip |
| POST | `/api/v1/student/exams/:id/start` | Create or resume an exam submission session |
| GET | `/api/v1/student/exams/:id/questions` | Fetch questions + `focusLossPolicy`, `activeSeconds`, `examDurationMins` (with shuffle persistence); clears `SAVE_AND_EXIT` close reason |
| GET | `/api/v1/student/exams/:id/draft` | Restore saved draft answers |
| POST | `/api/v1/student/exams/:id/auto-save` | Persist draft answers |
| POST | `/api/v1/student/exams/:id/run-code` | Execute code against public test cases |
| POST | `/api/v1/student/exams/:id/run-xpath` | Evaluate XPath/CSS selector against visible test cases |
| POST | `/api/v1/student/exams/:id/submit` | Finalize and grade exam; accepts optional `close_reason` |
| POST | `/api/v1/student/exams/:id/exit` | Save draft and exit; sets `close_reason: "SAVE_AND_EXIT"` and persists `activeSeconds` |
| GET | `/api/v1/student/completed` | List completed/submitted exams |
| GET | `/api/v1/student/completed/:id` | Get detailed result for a completed exam |
| PUT | `/api/v1/student/update-profile` | Update student's own profile |
| POST | `/api/v1/student/change-password` | Change student's own password |

### 8.3. Teacher Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| GET/POST | `/api/v1/teacher/exams` | List all exams / create exam (with `focusLossPolicy`) |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id` | Get, update, or delete an exam |
| POST | `/api/v1/teacher/exams/:id/clone` | Clone an existing exam |
| GET/POST | `/api/v1/teacher/exams/:id/questions` | List / create questions (CODE + XPATH config inline) |
| GET/PUT/DELETE | `/api/v1/teacher/exams/:id/questions/:questionId` | Get, update, or delete a specific question |
| GET/POST | `/api/v1/teacher/exams/:id/coding-config` | Get / set code config and test cases |
| GET/POST | `/api/v1/teacher/exams/:id/xpath-config` | Get / set XPath test cases per question |
| POST | `/api/v1/teacher/exams/:id/xpath-verify` | Verify a single XPath/CSS test case (advisory — never blocks save) |
| POST | `/api/v1/teacher/exams/:id/import-questions` | Bulk import questions from CSV/Excel |
| GET | `/api/v1/teacher/exams/:id/monitor` | Real-time SSE exam monitoring (includes `close_reason`) |
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

1. **Exam Shuffle Persistence:** Shuffled order is generated once per student, saved to `exam_submissions.question_order`, and restored exactly on all subsequent loads.
2. **Untested Code Warning:** If any `CODE` question has no run result at submission time, a modal prompts "Go Back & Test" or "Submit Anyway".
3. **Dynamic Quiz Score Recomputation:** Quiz scores are re-derived from selected options at read time for consistency with the displayed PASS/FAIL badge.
4. **Question Type Visual Identity:** `QUIZ` = Blue/Brand · `CODE` = Amber · `XPATH` = Emerald — applied consistently across all views.
5. **Vacuous Pass Detection:** When both `actualOutput` and `expectedOutput` are empty after a code run, the result is flagged amber with "⚠ No Output Produced" and a banner advising `print()` / `console.log()`.
6. **Stdin Input Injection:** Each test case's `inputData` is written to the student code process's stdin before execution. The Sample Cases tab displays the correct language-specific read pattern.
7. **Starter Code Pre-fill:** Starter code is pre-loaded into the student editor on first open. On subsequent opens, the saved draft takes priority.
8. **Memory Hard Cap (256 MB):** All code executions are capped at 256 MB RAM via `run_memory_limit: 262144` in the Piston request. No user-facing configuration; applied globally.
9. **Output Limit (OFE):** If a student program produces more than 10,000 characters of stdout, the test case is immediately marked `OFE` (Output Limit Exceeded) and graded as wrong.
10. **Focus Loss Enforcement:** In `WARN_AND_LOCK` mode, the workspace shows a modal warning on the 1st and 2nd tab-switch offenses. The 3rd offense triggers an automatic, un-bypassable submit recorded with `close_reason: "FOCUS_LOSS_THRESHOLD"`.
11. **XPath/CSS Hidden Test Cases:** Hidden test cases are withheld from "Run XPath" responses but evaluated at final submission, identical to hidden CODE test cases.
12. **XPath Verification is Advisory:** The per-test-case Verify button reports match count and HTML snippets but never blocks saving. A 0-match result shows a warning explaining the JS-rendering limitation.
13. **XPATH Completed Exam Display:** The completed exam detail view renders XPATH question results with the student's submitted selector in an emerald code block alongside AC/WA status and matched element count.
14. **Active-Time Timer:** The exam countdown is based on `activeSeconds` (time actually in the workspace), not wall-clock elapsed time from `startAt`. A student who saves and exits retains their remaining time on re-entry.
15. **Submission Status Derivation:** Every submission has a derived `submissionStatus`:  `SUBMITTED` if `submittedAt IS NOT NULL`; `CANCELLED` if `endTime` has passed and not submitted; `PENDING` if `closeReason = "SAVE_AND_EXIT"` and the exam window is still open; otherwise `IN_PROGRESS`.
16. **Save & Exit Lifecycle:** On exit, `closeReason` is set to `"SAVE_AND_EXIT"` and `activeSeconds` is saved. On re-entry via the questions endpoint, `closeReason` is cleared to `null` so monitors show the student as `IN_PROGRESS` again.
17. **Pending Students (Monitor):** A student with `PENDING` status in the monitor can be Force Submitted by the teacher, identical to an `IN_PROGRESS` student.
18. **Cancelled Submissions:** If a student never submitted and the exam window has closed, the submission shows `CANCELLED by System` in monitors and session views. No score is recorded.
19. **Student Exam List Status:** The exam selection page derives display status from the `GET /api/v1/student/exams` response: `CANCELLED` (exam closed, unsubmitted attempt) shows a disabled "Closed — Not Submitted" button; `PENDING` (Save & Exit, exam still open) shows "Resume Exam"; `IN_PROGRESS` shows "Continue Exam". Filter tabs include Pending and Cancelled options.
20. **Login Client-Side Validation:** The login form validates that username and password fields are non-empty before calling the API. Inline per-field error messages are shown in Vietnamese; the API call is skipped if validation fails.

---

## 10. Deployment & Infrastructure
- **Frontend + API:** Next.js 14+ (App Router), Node.js 18+ runtime
- **Database:** Neon PostgreSQL (serverless) accessed via Drizzle ORM
- **Migrations:** Apply incremental SQL files from `src/db/migrations/` in Neon SQL Editor, or run `init.sql` for a fresh environment. v7.3 adds `0006_active_seconds.sql` (`active_seconds` column on `exam_submissions`).
- **Code Sandbox:** External Piston API (`https://emkc.org/api/v2/piston`) or local child-process fallback (not sandboxed — production should use Piston or a Docker-isolated local runner)
- **XPath Evaluator:** Server-side `jsdom` — no container required; runs inline in the Next.js API route process

---

*END OF RSD.md — Version 7.3*
