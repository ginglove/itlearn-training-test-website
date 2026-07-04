Based on a systematic review of the unified Requirements Specification Document (RSD v9.1), here are key technical gaps, edge cases, and architectural areas where the specifications can be refined to prevent implementation ambiguities.

---

### 1. Security & Anti-Cheat Subsystem Refinements

#### Gap: Focus-Loss Counter Reset Bypass
*   **Current Specification:** Section 5.1 states that `focusLossCount` is held in component state only and resets to `0` on page reload.
*   **The Issue:** Students can bypass the `WARN_AND_LOCK` 3-offense threshold by reloading the browser window after their first or second tab switch.
*   **Improvement:** Mandate that client focus-loss events immediately trigger a lightweight, authenticated API request (`POST /api/v1/student/exams/:id/focus-loss`) to increment the count in the database. The workspace should pull this synchronized count on initial load and re-entry to maintain state integrity across reloads.

#### Gap: Client-Side Manipulation of `active_seconds`
*   **Current Specification:** The student workspace sends `activeSeconds` in the request body to `POST /student/exams/:id/exit` and `/auto-save`, which is written directly to the database.
*   **The Issue:** Tech-savvy candidates can intercept the network traffic or use the browser console to alter the payload, falsely reducing or inflating their reported active time.
*   **Improvement:** Implement backend-side verification. The server should track the `updated_at` time of the last client ping/heartbeat. If the incoming `activeSeconds` exceeds the time elapsed since the last recorded database update plus a small drift threshold (e.g., +5 seconds), the server should reject the request or clamp the value to the elapsed delta.

---

### 2. Database Schema & Data Integrity Refinements

#### Gap: No Table for Standalone Activity Submissions
*   **Current Specification:** Section 7.1 states that `EXERCISE` and `HOMEWORK` activity types may be standalone text-based tasks not backed by the core exam engine.
*   **The Issue:** There is no schema or table defined to capture student submissions, text answers, or files for these standalone tasks.
*   **Improvement:** Introduce a table for standalone text submissions to support these activity types without forcing them to rely on the exam engine tables:
    ```text
    +------------------------------------+
    |    workspace_activity_attempts     |
    +------------------------------------+
    | PK id (UUID)                       |
    | FK activity_id                     |
    | FK student_id                      |
    |    text_response (Text)            |
    |    submitted_at (Timestamp)        |
    |    score_percentage (Numeric)      |
    +------------------------------------+
    ```

#### Gap: Missing Unique Constraints on Junction Tables
*   **Current Specification:** Junction tables `workspace_teachers` and `workspace_memberships` are defined without explicit database keys.
*   **The Issue:** Lacking explicit unique keys can lead to duplicate entries, causing duplicate teacher records or duplicate student memberships in UI arrays.
*   **Improvement:** Enforce compound primary keys or unique constraints at the database engine level:
    *   `workspace_teachers`: `PRIMARY KEY (workspace_id, teacher_id)`
    *   `workspace_memberships`: `PRIMARY KEY (workspace_id, student_id)`

---

### 3. Execution Engine & Automation Sandboxing

#### Gap: SSRF Validation for XPath URL Fetches
*   **Current Specification:** Section 7.3 blocks private IP spaces for XPath/CSS remote target URLs.
*   **The Issue:** DNS rebinding attacks can bypass simple string-based IP checks if DNS resolution is not performed during the validation phase.
*   **Improvement:** Define a precise validation order:
    1. Resolve the target hostname to an IP address.
    2. Check that IP address against private CIDR ranges.
    3. Execute the HTTP fetch *only* if step 2 passes, bypassing subsequent lookup processes by using the pre-resolved IP in the request.

#### Gap: Performance and Redirect Constraints for HTML Fetches
*   **Current Specification:** URL fetches in `jsdom` mode have a hard 5-second timeout.
*   **The Issue:** Unconstrained redirects can create endless loops or performance bottlenecks on the server thread.
*   **Improvement:** Set explicit redirect limits (e.g., maximum of 3 redirects) and disable media/binary downloads during the target page fetch.

---

### 4. Concurrency & Performance Scaling

#### Gap: Database Polling Overhead in Teacher Monitor Dashboard
*   **Current Specification:** Real-time updates on the teacher dashboard (`/api/v1/teacher/exams/:id/monitor`) use Server-Sent Events (SSE).
*   **The Issue:** If the backend continually queries the PostgreSQL database for all student states on every SSE broadcast loop, database load will spike rapidly with large classes.
*   **Improvement:** Specify an event-driven mechanism. State transitions (such as starting an exam, auto-saving, or focus losses) should publish lightweight messages to an internal event bus (such as PostgreSQL `LISTEN`/`NOTIFY` or Redis Pub/Sub). The SSE thread should subscribe to this channel and push updates to teachers only when changes are detected, reducing database poll frequency.