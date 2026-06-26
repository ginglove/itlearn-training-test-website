# RSD Amendment: Security, Anti-Cheat & Scalability Hardening (v7.2 Proposls)

[cite_start]This document establishes the necessary engineering modifications and security patches to supplement the Requirements Specification Document (RSD) Version 7.1[cite: 1]. The following updates address critical infrastructure vulnerabilities, anti-cheat enforcement parameters, and architectural optimizations required for production deployment.

---

## 1. High-Risk Security & Stability Enhancements

### 1.1. Global Container Resource Constraints (OOM Safeguards)
* [cite_start]**Current Context:** Version 7.1 completely eliminates the `memoryLimit` boundary from the student UI, question builder forms, backend API validation schemes, and active Piston execution Payloads[cite: 1, 18, 20, 21]. [cite_start]The underlying table column `memory_limit` simply holds a static default backup value of 65536 KB[cite: 23].
* **Vulnerability:** Leaving the execution payload uncapped at runtime opens up a vector for host-level Out-of-Memory (OOM) Denial of Service (DoS) events. A malicious or poorly written script containing an infinite memory allocation loop (e.g., endlessly appending strings to an array) will rapidly consume host RAM, destabilizing the Piston environment and crashing adjacent containers for all concurrent examinees.
* **Mandated Patch:** * Implement a strict, platform-level hard memory limit ceiling directly inside the `code-executor.ts` microservice orchestration layer.
    * Enforce a fixed cap of `256MB` per execution container sandbox. This ceiling must be hardcoded within the execution client wrapper and applied to all incoming runtime requests, completely bypassing any default un-throttled parameters.

### 1.2. Standard Output (`stdout`) Flood Mitigation
* [cite_start]**Current Context:** Section 7.2 dictates standard execution pipeline mechanics covering `stdin` injection and `stdout` string comparisons [cite: 16][cite_start], including checking for empty student outputs[cite: 4, 61]. However, it defines no limits on the total characters or megabytes a program can output.
* [cite_start]**Vulnerability:** A student script executing an unconstrained loop containing a print statement (e.g., `while True: print("flood")`) will run continuously until the time limit barrier is reached[cite: 16]. This produces megabytes of text data in a single second. [cite_start]Attempting to parse, store, or transmit this massive string payload across network streams will overload server memory and lock up the Next.js frontend UI[cite: 27, 28].
* **Mandated Patch:**
    * Introduce a **Maximum Output Buffer Boundary** capped strictly at **1MB (or roughly 10,000 characters)** of raw output stream text.
    * Modify the `Judge Worker` execution pipeline to monitor buffer accumulation. If a running script attempts to exceed this threshold, the runner must immediately kill the sandbox process, discard excess data, and return a specialized execution status code: `OFE (Output Limit Exceeded)`.

---

## 2. Anti-Cheat & Telemetry Hardening

### 2.1. Focus Loss Enforcement Policy Engine
* [cite_start]**Current Context:** The platform embeds client-side telemetry via a Focus Loss Tracker that captures browser window `blur` events[cite: 46]. [cite_start]It increments an internal session counter and pushes live logs over Server-Sent Events (SSE) to the instructor's monitoring dashboard[cite: 46, 51].
* **Deficiency:** The tracking mechanism functions purely as a passive observation tool. It does not actively penalize a candidate who continuously switches browser tabs to reference external materials.
* **Mandated Patch:**
    * Expand the Teacher Exam Configuration dashboard to include an actionable dropdown setting: `Focus Loss Enforcement Policy` (Options: `Log Only`, `Warn and Lock`).
    * Integrate an automated disciplinary workflow on the client app:
        * **First & Second Offense:** Display a modal warning informing the student that a distraction event was logged.
        * [cite_start]**Third Offense (Threshold):** Trigger an immediate, un-bypassable auto-submit dispatch via `POST /api/v1/student/exams/:id/submit`[cite: 44, 60]. [cite_start]This must save all existing database drafts[cite: 48], terminate active exam workspace permissions, and flag the submission record state as `FORCE_CLOSED_CHEATING_SUSPECT`.

---

## 3. Architecture & Technical Debt Resolution

### 3.1. Sandboxing the Local Fallback Pipeline
* [cite_start]**Current Context:** Section 1.2 maps out the high-level infrastructure dependency using the Piston API alongside an internal "Local Fallback" script mechanism[cite: 30].
* [cite_start]**Vulnerability:** If the primary Piston microservice suffers a network drop or timeout[cite: 30], the system falls back to internal code execution. [cite_start]If this execution occurs natively on the Next.js API server instance without process isolation[cite: 27, 29], a student can execute an exploit script to read server environment variables, corrupt local file directories, or hijack system database credentials.
* **Mandated Patch:**
    * Explicitly mandate that the Local Fallback workflow must mirror the security architecture of the primary engine.
    * The fallback script must invoke a local, completely unprivileged, short-lived Docker container instance. This container must have host networking disabled (`--network none`) and be restricted to low-privilege read/write permissions on the host operating system.

### 3.2. Clean-up of Deprecated Database Columns
* [cite_start]**Current Context:** While the `memoryLimit` variables have been fully removed from runtime code logic, APIs, and configuration screens [cite: 18, 20, 21][cite_start], the `memory_limit` column is preserved inside the `code_configs` database table with its standard default setting to bypass executing data migrations[cite: 23].
* **Deficiency:** Keeping dead columns inside active application tables creates tech debt. It risks confusing new developers who may mistakenly attempt to wire business logic back into those fields.
* **Mandated Patch:**
    * [cite_start]Formally label the column as `DEPRECATED_memory_limit` inside the Drizzle ORM schema declaration file[cite: 27].
    * Schedule a database structural migration task for the next major release lifecycle (v8.0) to safely remove the column from the physical database layer.

---

## 4. Feature Clarifications & Constraints

### 4.1. XPath Runtime Standard Declaration
* [cite_start]**Current Context:** Section 1.2 outlines an XPath Evaluation mechanism that utilizes a shared, server-side JSDOM Engine[cite: 30]. [cite_start]It displays results inside the student's completed exam detail view[cite: 8].
* **Deficiency:** Standard JSDOM installations natively support only the archaic **XPath 1.0** specification. Instructors unaware of this limitation might design modern questions utilizing advanced XPath 2.0/3.0 functions (e.g., string manipulation helpers or regex evaluations), leading to unhandled evaluation errors.
* **Mandated Patch:**
    * [cite_start]Append an explicit constraints warning directly onto Section 1.2 and the Teacher Question Builder UI: *"UI automation criteria evaluations are strictly restricted to the XPath 1.0 specification standard due to the technical limitations of the backend JSDOM engine wrapper[cite: 30]."*