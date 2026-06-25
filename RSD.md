# Requirements Specification Document (RSD)
## Enterprise Online Quiz, Hybrid Coding & Automation Testing Platform
**Document Version:** 7.0 (XPath, Force-Submit fully implemented)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

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
- Full-height code editor with language selector.
- Bottom panel with **Sample Cases** and **Execution Output** tabs.
- **Run Code button:** Executes code against public test cases. Untested code throws a warning modal on exam submission.

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
Teachers configure Time/Memory limits, test cases (hidden/public), and an optional **Teacher Reference Code** (which generates the expected output dynamically at test time).

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
                              |    starter_code    |         |    target_type     |
                              +--------------------+         |    target_payload  |
                                         |                   |    reference_xpath |
                              +--------------------+         +--------------------+
                              |    test_cases      |
                              +--------------------+
```

---

## 7. Automatic Grading Architecture

### 7.1. Quiz Auto-Grading
Proportional partial credit. If any selected option is incorrect, score = 0.

### 7.2. Code Execution Pipeline
Code is run via Piston API/Local Fallback. Outputs are compared using float-tolerance normalization (e.g., `440000.0000006` == `440000`). Supports AC / WA / CE / RE / TLE status codes.

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
4. **Code Question Visual Identity:** `QUIZ` = Blue, `CODE` = Amber, `XPATH` = Emerald Green across all maps and UI indicators.

---

## 10. Deployment & Infrastructure
- **Frontend + API:** Next.js 14+ (App Router), Node.js 18+ runtime
- **Database:** Neon PostgreSQL (serverless) accessed via Drizzle ORM
- **Migrations:** Applied via `npm run db:setup` or `psql` executing `src/db/migrations/*.sql`
- **Code Sandbox:** External Piston API or local Express fallback worker.

--- END OF FILE RSD.md ---