# User Requirements Document (URD) & Technical Specifications
## Enterprise Online Quiz & Hybrid Coding Platform
**Document Version:** 4.2 (Production-Ready Specification)  
**Target Environments:** Python 3.10+, Node.js 18+ LTS  
**Core Framework Integration:** itlearn.edu.vn Core Platform Standard  

---

## 1. System Overview & Scope

### 1.1. Purpose
The Online Quiz and Coding Practice Platform is a unified web-based assessment application designed to automate theoretical and practical programming examinations. The platform minimizes manual grading overhead, implements strict academic integrity controls, and delivers real-time monitoring and analytics to instructors.

### 1.2. High-Level System Architecture
The platform is built on a microservices-inspired architecture designed to isolate web traffic from CPU-intensive, untrusted user code execution:

```
+---------------------------------------------------------------------------------+
|                                 FRONTEND CLIENT                                 |
|                   React.js / Next.js SPA (TypeScript & Tailwind)                |
+---------------------------------------------------------------------------------+
                                         |
                       +-----------------+-----------------+
                       | HTTPS                             | WebSockets (WSS)
                       v                                   v
+----------------------------------------+     +----------------------------------+
|              API GATEWAY               |     |    REAL-TIME SYNCHRONIZATION     |
|     Nginx Reverse Proxy & Rate Limiter |     |     Server (Node.js / Socket.io) |
+----------------------------------------+     +----------------------------------+
                       |                                   |
                       +-----------------+-----------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                            CORE BACKEND ENGINE                                  |
|         Node.js Express / Fastify Framework (Business Logic & Auth)             |
+---------------------------------------------------------------------------------+
          |                               |                           |
          v                               v                           v
+--------------------+         +--------------------+     +-----------------------+
| PRIMARY DATASTORE  |         | TASK QUEUE BROKER  |     |   SANDBOX EXECUTOR    |
| PostgreSQL         |         | Redis (BullMQ /    |     |   Docker Daemons /    |
| (Relational DB)    |         | Celery)            |     |   gVisor Isolates     |
+--------------------+         +--------------------+     +-----------------------+
```

*   **Frontend Client (SPA):** Built with React.js/Next.js and TypeScript, handling client-side state preservation, user-interface navigation, and local data persistence.
*   **API Gateway:** An Nginx instance managing SSL/TLS termination, static asset delivery, and strict rate-limiting policies.
*   **Core Backend Engine:** A Node.js (Express or Fastify) web service implementing business logic, identity management, relational updates, and system state transitions.
*   **Real-Time Synchronization Server:** A dedicated WebSocket service managing live socket connections, distributing heartbeat signals, logging active user status, and piping telemetry updates to the teacher dashboard.
*   **Execution Sandbox Pipeline:** A Redis-backed asynchronous queue (e.g., BullMQ) routing compiled execution scripts to isolated, unprivileged container runtimes.
*   **Primary Datastore:** A PostgreSQL instance managing relational constraints, transactional isolation, audit logs, and user performance history.

---

## 2. User Roles & Authentication Lifecycles

### 2.1. Role Definitions
*   **Teacher (Evaluator):** Administers exams, designs question banks, configures compilation and runtime limits, registers student cohorts, monitors live test sessions, and reviews automated grading reports.
*   **Student (Candidate):** Authenticates via temporary, instructor-provided credentials, participates in scheduled exam sessions, implements programmatic solutions to active test cases, answers multi-choice conceptual questions, and reviews authorized results.

### 2.2. Enforced Authentication & First-Time Lifecycle
To prevent unauthorized sign-ups, self-registration is disabled for student accounts. All credentials must be provisioned through administrative imports.

```
[Teacher Provisions Accounts] 
             |
             v
[Database creates user with is_first_login = TRUE and Temp Password]
             |
             v
[Student logs in with Temporary Credentials]
             |
             v
[Auth Middleware intercepts session: is_first_login == TRUE?]
             |
      +------+------+
      | YES         | NO
      v             v
[Redirect to Password Change Screen]   [Redirect to Main Dashboard]
      |
      v
[Enforce Regex: >=8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special]
      |
      v
[Update DB: password_hash, set is_first_login = FALSE]
      |
      v
[Redirect to Main Dashboard]
```

#### Lifecycle Phase 1: Account Seeding
The instructor initiates a bulk import via CSV or Excel format containing candidate details:
*   `student_id` (Unique numeric or alphanumeric key)
*   `full_name` (Text)
*   `email` (Valid format string)

#### Lifecycle Phase 2: Credential Generation
The system processes the imported records, generates a unique temporary password for each user, and inserts the user record into the database with `is_first_login` set to `TRUE`.

#### Lifecycle Phase 3: Access Interception
When a user attempts to authenticate via `/api/v1/auth/login`, the core auth handler evaluates the `is_first_login` attribute. If it is `TRUE`, the API returns a status payload requiring a password reset:
```json
{
  "status": "FORCE_PASSWORD_RESET",
  "reset_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0ZTM1Y..."
}
```

#### Lifecycle Phase 4: Password Complexity Enforcement
The application routes the user to a secure update interface. The backend enforces password validation using the following regular expression:
```regex
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$
```
*   **Criteria:** Minimum 8 characters, maximum 128 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character.

#### Lifecycle Phase 5: State Normalization
Once the user submits a password matching the complexity requirements, the backend updates the database with the hashed password, sets `is_first_login` to `FALSE`, invalidates the temporary token, and redirects the student to their primary dashboard.

---

## 3. Security, Monitoring & Anti-Cheat Subsystem

### 3.1. Client-Side Telemetry & Event Hooks
The testing interface actively monitors user interactions during exams and reports non-compliant actions to the backend.

```typescript
// Telemetry listeners for monitoring focus loss and page state
const initTelemetryTracker = (socketInstance: any, examId: string) => {
  const reportViolation = (reason: "TAB_BLUR" | "VISIBILITY_CHANGE") => {
    socketInstance.emit("TELEMETRY_VIOLATION", {
      examId,
      timestamp: new Date().toISOString(),
      violationType: reason,
      currentUrl: window.location.href
    });
  };

  // Detect when focus leaves the browser window
  window.addEventListener("blur", () => reportViolation("TAB_BLUR"));
  
  // Detect tab switching or window minimization
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      reportViolation("VISIBILITY_CHANGE");
    }
  });
};
```

*   **Focus Loss Tracker:** Monitors focus-loss events via the Page Visibility and Blur APIs. If a user moves away from the active window, the system triggers a telemetry payload, increments their violation count, and displays an on-screen warning modal.
*   **Clipboard & Context Menu Restrictions:** Restricts cut, copy, paste, and right-click interactions inside the code workspace to limit code sharing and external assistance.
```typescript
const configureInputRestrictions = (containerRef: React.RefObject<HTMLDivElement>) => {
  const handleRestrictions = (e: Event) => {
    e.preventDefault();
    return false;
  };

  const element = containerRef.current;
  if (element) {
    element.addEventListener("copy", handleRestrictions);
    element.addEventListener("cut", handleRestrictions);
    element.addEventListener("paste", handleRestrictions);
    element.addEventListener("contextmenu", handleRestrictions);
  }

  return () => {
    if (element) {
      element.removeEventListener("copy", handleRestrictions);
      element.removeEventListener("cut", handleRestrictions);
      element.removeEventListener("paste", handleRestrictions);
      element.removeEventListener("contextmenu", handleRestrictions);
    }
  };
};
```

### 3.2. Network Interruption & Session Resilience
The system is built to handle sudden network disruptions without losing student progress.

*   **Local State Buffering:** User submissions and code drafts are continuously synchronized to `localStorage` alongside a timestamped transaction sequence ID.
*   **State Synchronization Engine:** When a client reconnects after going offline, the background service sends a reconciliation payload to the server:
    ```json
    {
      "exam_id": "901b7a2d-1fd5-4927-b2f7-e6f3b0e3532f",
      "unsynced_payloads": [
        {
          "sequence_id": 104,
          "question_id": "7ca647e3-0c4a-4d92-bb63-228db9405d6e",
          "selected_options": ["31b53e41-01f1-4db8-b570-fc2b6efcf83a"],
          "timestamp": "2026-03-31T09:14:22.105Z"
        }
      ]
    }
    ```
    The server processes updates using transaction-level locks (`SELECT FOR UPDATE`), validating that older buffered data cannot overwrite newer updates already written to the database.

*   **Session IP Binding:** Upon authentication, the client’s public IP address is bound to their active JSON Web Token (JWT). The backend validates this IP address on every request.
```javascript
const verifyIpBinding = (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const sessionIp = req.user.boundIp;

  if (sessionIp && sessionIp !== clientIp) {
    // Log incident to database for review
    auditLogSecurityViolation(req.user.id, "IP_CHANGE_MISMATCH", clientIp, sessionIp);
    return res.status(403).json({
      error: "ACCESS_DENIED",
      message: "Session mismatch detected. Your IP address does not match your active exam session."
    });
  }
  next();
};
```

---

## 4. Candidate Workspace Interface Design (Hybrid Mode)

The candidate interface is designed to keep students focused on the exam tasks with minimal visual distractions.

### 4.1. Global Exam Wrapper
The global layout is constrained to the height of the user's viewport (`h-screen`) to prevent uncontrolled page scrolling.

```
+---------------------------------------------------------------------------------+
| Exam: Final Exam - Data Structures & Algorithms           [ TIMER: 01:24:15 ]   |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  [Q1: QUIZ (Teal)]  [Q2: QUIZ (Amber)]  [Q3: CODE (Blue)]  [Q4: CODE (Blue)]    |
|                                                                                 |
+---------------------------------------------------------------------------------+
|                                                                                 |
|                                ACTIVE WORKSPACE                                 |
|                                                                                 |
|                                                                                 |
|                                                                                 |
+---------------------------------------------------------------------------------+
|                                                           [ SUBMIT EXAM BUTTON ]|
+---------------------------------------------------------------------------------+
```

*   **Header Bar:** Displays the exam title, a live countdown timer synchronized with the server (which flashes red when under 5 minutes), and an explicit "SUBMIT EXAM" action button with confirmation dialogs.
*   **Auto-Save Engine:** Quietly auto-saves user inputs to the backend database every 15 seconds, displaying a subtle indicator when updates are saved.

### 4.2. Mode A: Gamified Quiz View
*   **Trigger Condition:** Activated when the active question's payload property `type` equals `"QUIZ"`.
*   **Interface Structure:** Displays a clean, prominent text block representing the central query, formatted using light markup.
*   **Selection Grid:** A responsive 2x2 grid containing four selectable option cards. Each card is styled with a distinct, high-contrast color scheme:
    *   **Option A:** Deep Teal (`bg-teal-700` with custom hover states)
    *   **Option B:** Amber (`bg-amber-700`)
    *   **Option C:** Slate Blue (`bg-indigo-700`)
    *   **Option D:** Rose Red (`bg-rose-700`)
*   **Interaction Model:** Selecting an option saves the choice and triggers a smooth sliding transition to load the next question in the list.

### 4.3. Mode B: Integrated IDE View
*   **Trigger Condition:** Activated when the active question's payload property `type` equals `"CODE"`.
*   **Workspace Splitting:** A two-column split layout:
    *   **Left Pane (40% Width):** Renders problem descriptions parsed from Markdown, along with resource limits and example test cases with inputs and outputs.
    *   **Right Pane (60% Width):** Displays the CodeMirror text editing instance.
*   **CodeMirror Editor Features:** Dark-themed syntax engine, line numbering, matching brackets, automatic indentations, and customizable font size preferences.
*   **Interaction Panel:** An expandable bottom section with tabs for a compilation log, user manual testing console (`stdin`/`stdout`), and test-suite output evaluations.

---

## 5. Evaluator/Teacher Management Panel & Data Ingestion

### 5.1. Live Roster & Monitoring Console
The teacher dashboard displays student progress in real-time. It subscribes to the real-time WebSocket channel to track candidates as they progress through the exam.

| Student Name | ID | Connection Status | Registered IP | Active Question | Focus Loss Alerts | Estimated Score | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **John Doe** | 20261102 | <span style="color:green">Online</span> | `192.168.1.45` | Question 4 (Code) | 0 | 45.00 / 100.00 | [ Force Submit ] |
| **Jane Smith** | 20261109 | <span style="color:orange">Offline</span> | `192.168.1.49` | Question 2 (Quiz) | 3 | 12.50 / 100.00 | [ Force Submit ] |
| **Alex Webb** | 20261114 | <span style="color:red">Disrupted</span> | `172.16.2.110` | None | 12 (Blocked) | 0.00 / 100.00 | [ Unlock User ] |

### 5.2. Universal Excel/CSV Importer
Teachers can upload batches of questions using an Excel or CSV template. The import process is designed to be atomic: either all questions in the sheet import successfully, or the entire transaction rolls back to prevent half-imported data.

```
+--------------------------------------------------------------------------------------------------------+
|                                  TEMPLATE STRUCTURE VALIDATOR                                          |
+----------+-----------+----------------+----------+----------+----------+----------+--------------------+
| type     | points    | question_text  | option_a | option_b | option_c | option_d | correct_identifier |
+----------+-----------+----------------+----------+----------+----------+----------+--------------------+
| QUIZ     | 5         | What is O(1)?  | Constant | Linear   | Log      | Quad     | A                  |
+----------+-----------+----------------+----------+----------+----------+----------+--------------------+
```

*   **Parsing Logic:**
    ```javascript
    // Transactional parsing routine for Excel data
    const parseExcelImportTransaction = async (filePath, examId) => {
      const dbTransaction = await db.transaction();
      try {
        const rows = await readExcelRows(filePath);
        
        for (const row of rows) {
          if (!row.type || !row.points || !row.question_text) {
            throw new Error(`Validation Error: Missing required fields in row ${row.index}`);
          }

          const newQuestion = await db.questions.create({
            data: {
              exam_id: examId,
              type: row.type,
              points: parseFloat(row.points),
              content: row.question_text
            },
            transaction: dbTransaction
          });

          if (row.type === 'QUIZ') {
            const options = [
              { text: row.option_a, key: 'A' },
              { text: row.option_b, key: 'B' },
              { text: row.option_c, key: 'C' },
              { text: row.option_d, key: 'D' }
            ];

            for (const option of options) {
              await db.quiz_options.create({
                data: {
                  question_id: newQuestion.id,
                  option_text: option.text,
                  is_correct: row.correct_identifier.toUpperCase() === option.key
                },
                transaction: dbTransaction
              });
            }
          }
        }
        await dbTransaction.commit();
        return { success: true, count: rows.length };
      } catch (error) {
        await dbTransaction.rollback();
        return { success: false, error: error.message };
      }
    };
    ```

### 5.3. Coding Task Construction Dashboard
The Coding Task Editor enables instructors to configure and test programming tasks before adding them to an exam.
*   **Resource Constraints:** Form inputs to set runtime timeouts (ms) and memory limits (KB) for student code.
*   **Markdown Preview Workspace:** A split editing panel where teachers can draft problem instructions in Markdown and view the formatted output side-by-side in real-time.
*   **Test Case Manager:** Interactive control interface allowing instructors to specify multiple parameters:
    *   **Input Data:** The raw data streamed to `stdin` during execution.
    *   **Output Data:** The expected text output from `stdout` for verification.
    *   **Visibility Toggle:** Options to make test cases **Public** (visible to students as samples) or **Hidden** (used only for back-end grading).

---

## 6. Expanded Database Schema

The database uses PostgreSQL standard types, indexes, and cascades to ensure data integrity and query performance.

```
   +------------------+         +------------------+         +----------------------+
   |      users       |         |      exams       |         |   exam_submissions   |
   +------------------+         +------------------+         +----------------------+
   | PK id (UUID)     |<--------| FK created_by    |         | PK id (UUID)         |
   |    username      |         |    title         |         | FK exam_id           |<---+
   |    password_hash |         |    description   |         | FK student_id        |    |
   |    role          |         |    start_time    |<--------|    start_at          |    |
   |    is_first_login|         |    end_time      |         |    submitted_at      |    |
   +------------------+         +------------------+         |    focus_loss_count  |    |
            |                            |                   +----------------------+    |
            |                            |                                               |
            |                            v                                               |
            |                   +------------------+                                     |
            |                   |    questions     |                                     |
            |                   +------------------+                                     |
            |                   | PK id (UUID)     |<---+                                |
            |                   | FK exam_id       |    |                                |
            |                   |    type (Enum)   |    |                                |
            |                   |    content (Text)|    |                                |
            |                   +------------------+    |                                |
            |                            |              |                                |
            +----------------------------+--------------+                                |
                                         |              |                                |
         +-------------------------------+--------------+                                |
         |                               |              |                                |
         v                               v              v                                |
+------------------+            +------------------+  +------------------+               |
|   quiz_options   |            |   code_configs   |  |    test_cases    |               |
+------------------+            +------------------+  +------------------+               |
| PK id (UUID)     |            | PK id (UUID)     |  | PK id (UUID)     |               |
| FK question_id   |            | FK question_id   |  | FK question_id   |               |
|    option_text   |            |    time_limit    |  |    input_data    |               |
|    is_correct    |            |    memory_limit  |  |    output_data   |               |
+------------------+            +------------------+  |    is_hidden     |               |
                                                      +------------------+               |
                                                                                         |
                                                      +----------------------+           |
                                                      |  submission_details  |           |
                                                      +----------------------+           |
                                                      | PK id (UUID)         |           |
                                                      | FK submission_id     |-----------+
                                                      | FK question_id       |
                                                      |    selected_options  |
                                                      |    source_code       |
                                                      |    score             |
                                                      +----------------------+
```

### 6.1. SQL Schema Definition (PostgreSQL DDL)
```sql
-- Enable UUID Generation Engine
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Declare custom constraints and execution categories
CREATE TYPE user_role AS ENUM ('TEACHER', 'STUDENT');
CREATE TYPE question_type AS ENUM ('QUIZ', 'CODE');
CREATE TYPE execution_status AS ENUM ('AC', 'WA', 'CE', 'RE', 'TLE');

-- 1. Base Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Base Exams Table
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- minutes
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_shuffled BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Base Questions Table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    type question_type NOT NULL,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    points DECIMAL(5, 2) NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL
);

-- 4. Conceptual Multi-Choice Options
CREATE TABLE quiz_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. Execution Sandboxing Limits
CREATE TABLE code_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    time_limit INTEGER NOT NULL DEFAULT 1000, -- milliseconds
    memory_limit INTEGER NOT NULL DEFAULT 65536 -- Kilobytes (64MB)
);

-- 6. Code Evaluation Test Cases
CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    input_data TEXT NOT NULL,
    output_data TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE
);

-- 7. Exam Submission Indexes
CREATE TABLE exam_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITH TIME ZONE,
    total_score DECIMAL(5, 2) DEFAULT 0.00,
    client_ip VARCHAR(45) NOT NULL,
    focus_loss_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT one_submission_per_student_exam UNIQUE (exam_id, student_id)
);

-- 8. Granular Submission Details Table
CREATE TABLE submission_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_options UUID[] DEFAULT '{}', -- Options chosen for QUIZ questions
    source_code TEXT, -- Code solution submitted for CODE questions
    language VARCHAR(30), -- Target platform: 'python' or 'javascript'
    status execution_status, -- Execution result code
    score DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    CONSTRAINT unique_question_per_submission UNIQUE (submission_id, question_id)
);

-- Database indexes for optimized lookup performance
CREATE INDEX idx_exams_dates ON exams(start_time, end_time);
CREATE INDEX idx_questions_exam_id ON questions(exam_id);
CREATE INDEX idx_quiz_options_question_id ON quiz_options(question_id);
CREATE INDEX idx_test_cases_question_id ON test_cases(question_id);
CREATE INDEX idx_submissions_lookup ON exam_submissions(exam_id, student_id);
CREATE INDEX idx_submission_details_lookup ON submission_details(submission_id);
```

---

## 7. Automatic Grading Architecture & Sandbox Execution Worker

### 7.1. Quiz Auto-Grading Algorithm
When a student submits a quiz question, the grading engine evaluates their selected options against the database's answer key. The engine supports partial credit for questions that have multiple correct answers.

The grading logic uses the following formula:

$$\text{Calculated Score} = \text{Points} \times \left( \frac{\text{Correct Student Options}}{\text{Total Correct Options}} \right)$$

#### Logic Constraints:
1.  **Partial Credit:** Students earn proportional credit based on the fraction of actual correct options they identify.
2.  **Incorrect Selections:** If a student selects any incorrect option, they receive 0 points for that entire question. This design prevents students from earning points by simply selecting all available options.
3.  **Strict Mode:** If strict mode is enabled in the exam settings, students must match the correct answer key exactly to receive points; any mismatch results in a score of 0.

### 7.2. Code Sandbox Execution Pipeline
To prevent security issues or system crashes, user-submitted code runs inside isolated containers with limited resources.

```
+------------------+      +------------------+      +------------------+
| Student Submits  |      | Backend Enqueues |      | Redis Task Queue |
| Code             |----->| Job              |----->| (BullMQ)         |
+------------------+      +------------------+      +------------------+
                                                             |
                                                             v
+------------------+      +------------------+      +------------------+
| Database Updates |      | Output Parser &  |      | Worker Pulls     |
| and Saves Score  |<-----| Case Comparator  |<-----| Task             |
+------------------+      +------------------+      +------------------+
                                                             |
                                                             v
                                                    +------------------+
                                                    | Run in Sandboxed |
                                                    | gVisor Container |
                                                    +------------------+
```

#### Step 1: Job Enqueuing
When a candidate submits their code, the API server packages the execution context and creates a grading job in the Redis task queue:
```json
{
  "jobId": "submission_evaluation_88921",
  "submissionId": "a7b3c202-094c-42b1-b922-cf8221bc3410",
  "sourceCode": "import sys\n# User python logic...",
  "language": "python",
  "timeLimitMs": 1000,
  "memoryLimitKb": 65536,
  "testCases": [
    { "id": "tc_1", "input": "4\n", "output": "24\n" }
  ]
}
```

#### Step 2: Sandbox Container Orchestration
The background worker pulls the grading job from the queue and spins up an unprivileged container configured with a secure runtime (such as gVisor or runsc) and strict system policies:
*   **Network Isolation:** Containers run with no network access (`--network none`) to prevent external connections or data extraction.
*   **CPU Limits:** Execution runtimes are capped at 0.5 CPU cores (`--cpus="0.5"`) to prevent infinite loops from exhausting server resources.
*   **Memory Controls:** Container memory is limited using the `-m` flag (e.g., `-m 64m` for a 64MB memory limit).
*   **Read-Only Filesystem:** The root directory is mounted as read-only (`--read-only`), except for designated temporary directories.
*   **System Controls:** Programs run under a non-root account (`USER runner`) with custom limits to prevent thread generation and fork bombs (e.g., setting `ulimit -u 20` to limit processes to 20 threads).

```typescript
// Script executed on host machine to run sandboxed program
const execString = `docker run --rm \
  --network none \
  --memory="64m" \
  --cpus="0.5" \
  --user runner \
  -v ${localPath}:/app:ro \
  python-runner-image \
  timeout -s 9 2 python /app/solution.py < /app/input.txt`;
```

#### Step 3: Stream Evaluation & Metrics Mapping
The sandbox environment streams inputs (`stdin`) to the compiled program, captures output buffers, and monitors system resource usage.

| Execution Result | Definition | Metrics & Grading Logic |
| :--- | :--- | :--- |
| **Accepted (AC)** | The code executed successfully and returned the correct output. | The program ran within resource limits and matched the expected output for all test cases. **Awarded 100% points.** |
| **Wrong Answer (WA)** | The code executed successfully but returned the wrong output. | The program ran to completion, but the output did not match the expected test cases. **The final score is scaled based on the percentage of test cases passed.** |
| **Compile / Syntax Error (CE)** | The code could not be compiled or interpreted. | The compiler or interpreter returned syntax or build errors. **Awarded 0 points.** The compilation logs are saved and displayed to the student for debugging. |
| **Runtime Error (RE)** | The program crashed during execution. | The program terminated with a non-zero exit code (e.g., due to memory issues or division by zero). **Awarded 0 points for any failed test cases.** |
| **Time Limit Exceeded (TLE)** | The program took too long to run. | The program did not complete execution within the allotted time limit. **Awarded 0 points for any timed-out test cases.** |

---

## 8. WebSockets Synchronization Protocol & API Specifications

### 8.1. Restful Route Catalog

#### Authentication & Lifecycle Operations
*   `POST /api/v1/auth/login` - Authenticates credentials, registers client IP addresses, and returns active session tokens.
*   `POST /api/v1/auth/password-reset` - Processes temporary password changes and sets `is_first_login` to `FALSE`.

#### Student Assessment Actions
*   `GET /api/v1/student/exams` - Returns a list of active and scheduled exams authorized for the student.
*   `POST /api/v1/student/exams/:id/start` - Initializes an exam session, logs the start timestamp, and creates a submission record.
*   `GET /api/v1/student/exams/:id/questions` - Retrieves exam questions. Respects shuffling and categorization settings.
*   `POST /api/v1/student/exams/:id/auto-save` - Regularly saves user answers to prevent data loss.
*   `POST /api/v1/student/exams/:id/submit` - Finalizes the exam session and triggers the auto-grading pipeline.

#### Teacher Administration Panels
*   `POST /api/v1/teacher/exams` - Creates a new exam configuration.
*   `POST /api/v1/teacher/exams/:id/import-questions` - Parses questions and options from an uploaded spreadsheet.
*   `POST /api/v1/teacher/exams/:id/coding-config` - Configures system limits, test cases, and visibility flags for code execution questions.
*   `GET /api/v1/teacher/exams/:id/monitor` - Returns real-time exam status data for the student monitoring dashboard.
*   `POST /api/v1/teacher/students/bulk-create` - Imports student rosters and provisions temporary access credentials.

---

### 8.2. Endpoint Payload Structure Examples

#### Endpoint: POST `/api/v1/auth/login`
*   **Request Headers:** `Content-Type: application/json`
*   **Request Body:**
    ```json
    {
      "username": "20261102",
      "password": "TemporaryPassword_12!"
    }
    ```
*   **Response (200 OK - Active Session):**
    ```json
    {
      "status": "SUCCESS",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0ZTM1Y...",
      "user": {
        "id": "e2a1b94d-178c-4903-8822-e1cbfa102005",
        "username": "20261102",
        "full_name": "John Doe",
        "role": "STUDENT",
        "is_first_login": false
      }
    }
    ```
*   **Response (401 Unauthorized):**
    ```json
    {
      "error": "UNAUTHORIZED",
      "message": "The username or password provided is incorrect."
    }
    ```

#### Endpoint: POST `/api/v1/student/exams/{exam_id}/submit`
*   **Request Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX...`
*   **Request Body:**
    ```json
    {
      "submission_id": "871b6c0e-402a-4df4-a311-b1e0fcfb2c34",
      "answers": [
        {
          "question_id": "a92a54b3-d6c1-4b72-8711-cf019a0e1012",
          "type": "QUIZ",
          "selected_options": ["31b53e41-01f1-4db8-b570-fc2b6efcf83a"]
        },
        {
          "question_id": "b32b11e2-cf05-4d2a-921c-ab0511fa9a22",
          "type": "CODE",
          "language": "python",
          "source_code": "def solve(n):\n    return n * n\n\nif __name__ == '__main__':\n    import sys\n    for line in sys.stdin:\n         if line.strip():\n             print(solve(int(line.strip())))\n"
        }
      ]
    }
    ```
*   **Response (202 Accepted - Submission Enqueued):**
    ```json
    {
      "status": "QUEUED",
      "submission_id": "871b6c0e-402a-4df4-a311-b1e0fcfb2c34",
      "message": "Your submission was received successfully. The evaluation queue is currently processing grading evaluations.",
      "submitted_at": "2026-03-31T10:00:00.124Z"
    }
    ```

---

### 8.3. WebSocket Interconnection Channels
The real-time synchronization server uses WebSockets to maintain live communication channels during exam sessions.

```
       STUDENT CLIENT                                      SOCKET SERVER
             |                                                   |
             | ---- [EMIT: JOIN_EXAM_ROOM (jwt, examId)] ------> |
             |                                                   |
             | <--- [EMIT: CONNECTION_CONFIRMED] --------------- |
             |                                                   |
             | (Student leaves window focus)                     |
             | ---- [EMIT: FOCUS_LOST (violation payload)] ----> |
             |                                                   |
             |                                                   | -- [Broadcasts warning update to Teacher Dashboard]
             |                                                   |
             | <--- [EMIT: TIME_SYNC (server timestamp)] -------- |  (Every 5 seconds)
             |                                                   |
             | (Exam time expires globally)                      |
             | <--- [EMIT: FORCE_SUBMIT] ----------------------- |
             |                                                   |
             | ---- [EMIT: FORCE_SUBMIT_CONFIRMED] ------------> |
```

#### Client Message: `JOIN_EXAM_ROOM`
Enables a student to join an exam session. The server validates their authorization before admitting them to the channel.
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "examId": "901b7a2d-1fd5-4927-b2f7-e6f3b0e3532f"
}
```

#### Client Message: `FOCUS_LOST`
Sent by the client when focus leaves the browser window, alerting the system of a possible academic integrity violation.
```json
{
  "examId": "901b7a2d-1fd5-4927-b2f7-e6f3b0e3532f",
  "timestamp": "2026-03-31T09:15:30.401Z"
}
```

#### Server Message: `TIME_SYNC`
Broadcast every 5 seconds to calibrate countdown timers across all student interfaces.
```json
{
  "serverTime": "2026-03-31T09:15:35.000Z",
  "remainingSeconds": 3865
}
```

#### Server Message: `FORCE_SUBMIT`
Triggered by the server when exam time runs out, prompting the client to submit immediately.
```json
{
  "examId": "901b7a2d-1fd5-4927-b2f7-e6f3b0e3532f",
  "reason": "EXAM_TIME_EXPIRED"
}
```

---

## 9. Deployment Topology & Systems Architecture

The platform's deployment strategy uses dedicated servers to separate standard web traffic from compiled code execution tasks.

```
                  +----------------------------------------------+
                  |               NGINX REVERSE PROXY            |
                  |          (Rate Limiting & SSL Termination)   |
                  +----------------------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
+------------------------------------+     +------------------------------------+
|        NODE.JS API SERVERS         |     |        WEBSOCKET CLUSTERS          |
|  (Load-balanced web instances)     |     |  (Horizontal Scale with Redis adapter)
+------------------------------------+     +------------------------------------+
                       |                                   |
                       +-----------------+-----------------+
                                         |
                                         v
+-------------------------------------------------------------------------------+
|                        INTERNAL PRIVATE SUBNET                                |
|                                                                               |
|  +-----------------------+  +-------------------+  +-----------------------+  |
|  | PostgreSQL DB Server  |  | Redis Server      |  | Isolated Compute      |  |
|  | (Primary Data Storage)|  | (Queue Management)|  | Worker Nodes          |  |
|  +-----------------------+  +-------------------+  +-----------------------+  |
+-------------------------------------------------------------------------------+
```

### 9.1. Nginx Gateway Routing Configuration
```nginx
# Configure upstream application servers
upstream api_servers {
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;
}

upstream websocket_servers {
    server 127.0.0.1:4001;
}

server {
    listen 443 ssl http2;
    server_name itlearn.edu.vn;

    ssl_certificate /etc/letsencrypt/live/itlearn.edu.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/itlearn.edu.vn/privkey.pem;

    # Rate limiting rule: Max 15 requests per second per IP
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=15r/s;

    location / {
        root /var/www/itlearn-frontend/out;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        limit_req zone=api_limit burst=30 nodelay;
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /socket.io/ {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

### 9.2. Infrastructure Resource Profiles
To ensure reliable operation during peak load periods (such as mid-term or final exams), the system is deployed using three distinct infrastructure profiles:

*   **Database Host Node:**
    *   **Resource Allocation:** Dedicated PostgreSQL server with 4 vCPUs, 16 GB RAM, and SSD storage.
    *   **Data Protection Strategy:** Automatic Point-In-Time Recovery (PITR) backups run daily at midnight. Real-time transaction logs (Write-Ahead Logging) are archived to remote S3 block storage to protect exam data against host failures.
*   **Web API Gateway & Worker System Node:**
    *   **Resource Allocation:** Horizontal pool of 2 web host nodes, each with 2 vCPUs and 4 GB RAM.
    *   **Queue Architecture:** A shared Redis cluster tracks job queues, manages lock states, and coordinates WebSocket synchronization across backend nodes.
*   **Dedicated Worker Nodes (Sandboxed Running Environments):**
    *   **Resource Allocation:** A specialized group of compute-optimized VM instances running Docker Daemons.
    *   **Resource Isolation Policies:** Workers evaluate code submissions within isolated Docker containers using strict system resource limits (e.g., `-m 64m`, `--cpus="0.5"`, and `--network none`). This isolation keeps heavy user submissions or infinite loop bugs from impacting the performance of the main API server.