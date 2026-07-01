# RSD Updated Requirements
## Enterprise Online Quiz, Hybrid Coding & Automation Testing Platform
**Based on:** RSD v7.3  
**Update Date:** 2026-07-01  
**Scope:** 10 improvement points identified in RSD review

---

## #1 — `submissionStatus` Priority Rule (Section 9, Rule 15)

**Action:** Replace existing Rule 15 with the following.

> **15. Submission Status Derivation:** Every submission derives a `submissionStatus` using the following ordered evaluation (first matching condition wins):
>
> | Priority | Condition | Status |
> | :---: | :--- | :--- |
> | 1 | `submittedAt IS NOT NULL` | `SUBMITTED` |
> | 2 | `submittedAt IS NULL` AND `exam.endTime < NOW()` | `CANCELLED` |
> | 3 | `closeReason = "SAVE_AND_EXIT"` AND `exam.endTime ≥ NOW()` | `PENDING` |
> | 4 | None of the above | `IN_PROGRESS` |
>
> If `submittedAt IS NOT NULL` and `closeReason` is also set (e.g. from a prior Save & Exit before final submission), `SUBMITTED` always takes precedence. No other condition can override a non-null `submittedAt`.

---

## #2 — `active_seconds` Upper Bound & Timer Floor (Section 9, Rule 14a)

**Action:** Insert new Rule 14a after existing Rule 14.

> **14a. Timer Floor & Overflow Guard:** The remaining time shown in the workspace is computed as:
> ```
> remainingSeconds = (examDurationMins × 60) − activeSeconds
> ```
> If `remainingSeconds ≤ 0` (i.e. `activeSeconds` has met or exceeded the total exam duration), the workspace **must** treat remaining time as `0` and immediately display the Time's Up overlay — identical to a natural timer expiry. The workspace **must not** display a negative countdown. If `activeSeconds` in the API response exceeds `examDurationMins × 60`, the backend **must** clamp the persisted value to `examDurationMins × 60` before returning it.

---

## #3 — Re-entry Atomicity for `closeReason` (Section 3.2.1 — New)

**Action:** Add new sub-section 3.2.1 under Section 3.2.

> **3.2.1. Re-entry Atomicity:** When a student re-enters the workspace via `GET /api/v1/student/exams/:id/questions`, the server **must** clear `close_reason` to `NULL` within the **same database transaction** that returns the question payload. This ensures the monitor dashboard cannot observe a submission in a transient `PENDING` state while the student is actively in the workspace. Implementations **must not** clear `close_reason` in a separate subsequent query outside the transaction boundary.
>
> **Consistency guarantee:** The monitor's SSE stream derives `submissionStatus` at query time. Because the clear is atomic, any monitor poll after the re-entry request completes will see `IN_PROGRESS`. Polls that arrive concurrently with the re-entry request may see either `PENDING` or `IN_PROGRESS` — this is acceptable and does not constitute a bug.

---

## #4 — Focus Loss Guard in Behavioral Spec (Section 9, Rule 10)

**Action:** Replace existing Rule 10 with the following.

> **10. Focus Loss Enforcement:** In `WARN_AND_LOCK` mode, the workspace shows a blocking, non-dismissible modal warning on the 1st and 2nd tab-switch offenses (window `blur` events). The 3rd offense triggers an automatic, un-bypassable submit recorded with `close_reason: "FOCUS_LOSS_THRESHOLD"`.
>
> **Guard condition:** The auto-submit on the 3rd offense is only triggered if `questions.length > 0` at the time the event fires. If the 3rd blur event occurs before the question list has finished loading (e.g. slow network on initial entry), the offense is **incremented and recorded** but the auto-submit is **deferred** until questions have loaded. Once `questions.length > 0` is satisfied, if the counter has already reached 3, auto-submit fires immediately.
>
> **Counter persistence:** `focusLossCount` is held in component state only and resets to `0` on page reload. It is not persisted across re-entries. The cumulative `focus_loss_count` stored on `exam_submissions` accumulates across all sessions.

---

## #5 — `POST /exit` Request & Response Contract (Section 8.2.1 — New)

**Action:** Add new sub-section 8.2.1 after the exit endpoint row in Section 8.2.

> **8.2.1. Exit Endpoint Contract**
>
> **Request Body:**
> ```json
> {
>   "activeSeconds": 342
> }
> ```
>
> | Field | Type | Required | Description |
> | :--- | :--- | :---: | :--- |
> | `activeSeconds` | `integer ≥ 0` | ✅ | Cumulative seconds spent in workspace during this session. Must not exceed `examDurationMins × 60`. |
>
> **Success Response — `200 OK`:**
> ```json
> {
>   "message": "Draft saved. Exam session paused.",
>   "closeReason": "SAVE_AND_EXIT",
>   "activeSeconds": 342
> }
> ```
>
> **Error Responses:**
>
> | HTTP Status | Condition | Error Code |
> | :---: | :--- | :--- |
> | `400 Bad Request` | `activeSeconds` missing or non-integer | `INVALID_ACTIVE_SECONDS` |
> | `403 Forbidden` | Exam window has already closed (`endTime < NOW()`) | `EXAM_WINDOW_CLOSED` |
> | `409 Conflict` | Submission already `SUBMITTED` (`submittedAt IS NOT NULL`) | `ALREADY_SUBMITTED` |
> | `404 Not Found` | No active submission found for this student + exam | `SUBMISSION_NOT_FOUND` |
>
> **Side effects (must all occur atomically):**
> 1. `exam_submissions.close_reason` set to `"SAVE_AND_EXIT"`.
> 2. `exam_submissions.active_seconds` updated to received value (clamped to duration ceiling).
> 3. Current draft answers flushed to `draft_answers` (same as auto-save behavior).

---

## #6 — CSS vs XPath AC Condition Clarification (Section 7.3, Step 4)

**Action:** Replace Step 4 in the Evaluation flow of Section 7.3.

> **Step 4 — Match Comparison:**
>
> | Selector Type | AC Condition |
> | :--- | :--- |
> | `XPATH` | Element count matches **AND** each node is identical by DOM object reference within the same `jsdom` instance. |
> | `CSS` | Element count matches **AND** the `outerHTML` of each matched element, in document order, is byte-for-byte identical between the student's result and the reference result. |
>
> **Rationale:** CSS selectors evaluated via `querySelectorAll` on two separate `jsdom` parses of the same HTML will produce structurally identical but reference-distinct nodes. Therefore DOM reference comparison (`===`) is not valid for CSS mode. `outerHTML` string comparison is used instead.
>
> **Edge case:** If both the student's selector and the reference selector match zero elements, the test case is `WA` — a vacuous match is never `AC`. This prevents empty selectors from trivially passing.

---

## #7 — Student Exam List Field Unification (Section 8.2 + Section 9, Rule 19)

**Action A:** Replace the `GET /api/v1/student/exams` row description in Section 8.2.

> | GET | `/api/v1/student/exams` | List available/assigned exams. Each entry includes a derived `submissionStatus` field (`IN_PROGRESS`, `PENDING`, `CANCELLED`, or `null` if not yet started) computed using the same priority rules as Section 9 Rule 15. The fields `activeAttemptCancelled` and `activeAttemptPaused` are **deprecated** as of v7.3 and will be removed in v8.0. Frontend must derive display state exclusively from `submissionStatus`. `activeSeconds` is also returned per entry to allow the workspace to resume the timer without an additional round-trip. |

**Action B:** Append the following sentence to the end of Section 9, Rule 19.

> The exam selection page derives all display states from the `submissionStatus` field returned in `GET /api/v1/student/exams`. The deprecated boolean fields `activeAttemptCancelled` and `activeAttemptPaused` **must not** be used for display logic in new code.

---

## #8 — Force-Submit Lifecycle (Section 9, Rule 17a — New)

**Action:** Insert new Rule 17a after existing Rule 17.

> **17a. Force-Submit Lifecycle:** When a teacher triggers `POST /api/v1/teacher/exams/:id/force-submit` for a student in `IN_PROGRESS` or `PENDING` status:
>
> 1. The server grades all submitted answers at the time of the call (same grading pipeline as voluntary submission).
> 2. `exam_submissions.submitted_at` is set to `NOW()`.
> 3. `exam_submissions.close_reason` is set to `"FORCE_SUBMITTED"` — this value distinguishes teacher-initiated termination from student-voluntary submission (`NULL`) and auto-submit (`"FOCUS_LOSS_THRESHOLD"`).
> 4. `exam_submissions.active_seconds` is **not modified** by force-submit — it retains the last value persisted by the student's most recent Save & Exit or auto-save.
> 5. The resulting `submissionStatus` is `SUBMITTED` (Rule 15, Priority 1 applies immediately).
>
> **Error cases:**
>
> | HTTP Status | Condition | Error Code |
> | :---: | :--- | :--- |
> | `409 Conflict` | Student has already submitted (`submittedAt IS NOT NULL`) | `ALREADY_SUBMITTED` |
> | `403 Forbidden` | Requesting user is not the exam's owner | `FORBIDDEN` |
> | `404 Not Found` | No submission record found | `SUBMISSION_NOT_FOUND` |

---

## #9 — Local Fallback Behavior & Alert Spec (Section 10)

**Action:** Replace the "Code Sandbox" bullet in Section 10 with the following.

> **Code Sandbox:** External Piston API (`https://emkc.org/api/v2/piston`) is the primary execution backend. A local child-process fallback is available but **is not sandboxed** and **must not be used in production**.
>
> **Fallback trigger conditions** (any of the following):
> - Piston API returns a non-2xx HTTP status.
> - Piston API connection times out (threshold: 10 seconds).
> - Piston API is unreachable (DNS/network failure).
>
> **On fallback activation:**
> 1. A `WARN`-level server log entry must be emitted: `[CODE_EXEC] Piston unavailable — falling back to local executor. Reason: <reason>`.
> 2. The execution proceeds via the local child-process runner.
> 3. The API response includes a non-blocking field `"executionBackend": "LOCAL_FALLBACK"` so monitoring tools can detect degraded mode.
>
> **Production requirement:** Deployments to production environments **must** configure a valid Piston endpoint or a Docker-isolated local runner. The unsandboxed local fallback must be disabled via environment flag `DISABLE_LOCAL_FALLBACK=true` in production.

---

## #10 — Error Code Catalog (Section 8.5 + 8.6 — New)

**Action:** Add new sections 8.5 and 8.6 after the existing Section 8 endpoint tables.

> ### 8.5. Standard Error Response Format
>
> All API errors return a consistent JSON envelope:
> ```json
> {
>   "error": {
>     "code": "EXAM_WINDOW_CLOSED",
>     "message": "The exam window has closed and no further actions are permitted.",
>     "httpStatus": 403
>   }
> }
> ```
>
> ### 8.6. Error Code Reference
>
> | Error Code | HTTP Status | Trigger Condition |
> | :--- | :---: | :--- |
> | `INVALID_ACTIVE_SECONDS` | 400 | `activeSeconds` missing, non-integer, or negative in exit/auto-save request. |
> | `EXAM_WINDOW_CLOSED` | 403 | Action attempted after `exam.endTime < NOW()` (start, exit, auto-save). |
> | `ALREADY_SUBMITTED` | 409 | Action attempted on a submission where `submittedAt IS NOT NULL`. |
> | `SUBMISSION_NOT_FOUND` | 404 | No `exam_submissions` row found for the authenticated student + exam ID. |
> | `EXAM_NOT_FOUND` | 404 | No exam with the given `:id` exists or is visible to the requester. |
> | `FORBIDDEN` | 403 | Authenticated user lacks permission for the requested action (e.g. teacher acting on another teacher's exam). |
> | `FORCE_PASSWORD_RESET_REQUIRED` | 403 | `is_first_login = TRUE` — student must reset password before accessing exam content. |
> | `FOCUS_LOSS_SUBMIT_FAILED` | 500 | Auto-submit triggered by focus-loss threshold but the submission pipeline failed. Logged server-side; student sees a generic error. |
> | `PISTON_UNAVAILABLE` | 503 | Both Piston API and local fallback are unavailable or disabled. |
> | `OFE_OUTPUT_LIMIT` | 200 | *(Not an HTTP error — returned inline in execution result.)* Student stdout exceeded 10,000 characters. |
> | `XPATH_PARSE_ERROR` | 200 | *(Not an HTTP error — returned inline in run-xpath result.)* Student's XPath/CSS expression failed to parse. |
> | `SSRF_BLOCKED` | 400 | URL in XPath test case targets a private/internal network range. |
> | `XPATH_FETCH_TIMEOUT` | 200 | *(Not an HTTP error — returned inline.)* URL fetch for XPath target exceeded 5-second timeout. |

---

*END OF UPDATED REQUIREMENTS — Based on RSD v7.3 review, 2026-07-01*
