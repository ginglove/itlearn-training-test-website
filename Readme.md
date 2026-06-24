# ITLearn Enterprise Platform - Online Quiz & Hybrid Coding System

A secure, high-performance web platform for hosting software testing exams, quizzes, and automated multi-language code execution assessments. Built with Next.js App Router, Tailwind CSS v4, Drizzle ORM, Neon Serverless PostgreSQL, Upstash Redis, and deployed on Netlify.

---

## Key Features

- **Interactive Student Exam Workspace:** Real-time countdown timer, side-by-side multiple choice selections, and a full-featured code editor.
- **Asynchronous Code Execution Queue:** Student code submissions are pushed to a Redis queue and graded asynchronously against test cases via sandboxed environments.
- **Teacher / Admin Dashboard:** Manage questions (add, edit, delete), assign exams, review focus loss analytics, monitor live student exam progress, and grade history.
- **Anti-Cheat Monitoring:** Captures browser tab focus switches and triggers alerts in the monitor screen.
- **Bespoke UI styling:** Premium dark glassmorphic components, Bricolage Grotesque display headers, Plus Jakarta Sans text, and custom background radial glows matching the ITLearn brand design.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (React 19, TypeScript) |
| Styling | Tailwind CSS v4, Framer Motion |
| Database | Neon Serverless PostgreSQL (WebSocket driver — supports transactions) |
| ORM | Drizzle ORM |
| Cache / Queue | Upstash Redis (REST API) |
| Authentication | JWT stored in secure HTTP-only cookies |
| Hosting | Netlify (Next.js via `@netlify/plugin-nextjs` v5) |
| Cron Worker | Netlify Scheduled Function (runs every minute) |
| Code Execution | Piston API (external sandboxed executor) |

---

## Why These Services Work on Netlify (Serverless)

Netlify runs each API route as a short-lived serverless function. Traditional TCP database connections don't persist between invocations, which exhausts connection limits quickly. Neon and Upstash both solve this:

- **Neon** — uses `@neondatabase/serverless` with the WebSocket `Pool` driver (`drizzle-orm/neon-serverless`). The pool is re-established per function invocation and fully supports `db.transaction()`. No persistent connections, no connection pool exhaustion.
- **Upstash Redis** — the `@upstash/redis` package uses the Upstash REST API over HTTPS by design. It is natively serverless-compatible with zero configuration changes.
- **Piston API** — code execution is delegated to the external Piston API over HTTPS. Local child-process execution is disabled on Netlify. Set `executionMode` to `API_ONLY` in Platform Settings after the first deploy.

---

## Local Development Setup

### 1. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Neon PostgreSQL connection string
# For local Postgres:  postgresql://username:password@127.0.0.1:5432/db_name
# For Neon dev branch: postgresql://user:pass@ep-xxx.pooler.neon.tech/dbname?sslmode=require
DATABASE_URL="postgresql://username:password@127.0.0.1:5432/db_name"

# JWT secret — must be set; use: openssl rand -hex 32
JWT_SECRET="your_long_random_secret_here"

# Upstash Redis — create a free database at upstash.com and copy the REST credentials
UPSTASH_REDIS_REST_URL="https://your-upstash-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_token_here"

# Internal cron secret — any secret string; must match what the cron function sends
INTERNAL_CRON_SECRET="your-cron-auth-secret-token"

# Optional: override the default Piston API endpoint
# PISTON_API_URL="https://emkc.org/api/v2/piston"
```

> **Note:** `JWT_SECRET` and `INTERNAL_CRON_SECRET` are required. The app throws an error at startup if either is missing.

> **Upstash locally:** The `@upstash/redis` package communicates over HTTPS REST, so the same Upstash credentials work identically in local development and production. No local Redis server is needed.

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize Database Schema

Applies the full schema from `init.sql` to the database at `DATABASE_URL`:

```bash
npm run db:setup
```

### 4. Seed Database

Inserts default teacher, student accounts, settings, exam configurations, and test cases:

```bash
npm run seed
```

> Only run the seed once. Re-running on a populated database will cause duplicate key errors.

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Seed Credentials

| Role | Username | Password |
|---|---|---|
| Student | `20261102` | `password123` |
| Teacher / Admin | `teacher1` | `password123` |

> All seeded accounts require a password change on first login (enforced by platform settings).

---

## Database Schema Operations

| Script | Command | Description |
|---|---|---|
| Apply schema | `npm run db:setup` | Reads `init.sql` and applies it to `DATABASE_URL` |
| Seed data | `npm run seed` | Inserts default users, exams, and questions |

---

## Production Deployment Guide

### Step 1: Set Up Neon PostgreSQL

1. Sign in to [neon.tech](https://neon.tech/) and create a new project.
2. Choose your PostgreSQL version and the region **closest to your Netlify deployment region** (reduces latency). Netlify defaults to `us-east-1` — choose **US East (N. Virginia)** on Neon if unsure.
3. From the Neon project dashboard, go to **Connection Details**.
   - Copy the **Direct connection string** (non-pooled) — used only for `db:setup` and `seed` scripts.
   - Copy the **Pooled connection string** (via PgBouncer) — this is `DATABASE_URL` for the deployed app.

   The pooled string looks like:
   ```
   postgresql://user:password@ep-xxx.pooler.neon.tech/dbname?sslmode=require
   ```

### Step 2: Set Up Upstash Redis

1. Sign in to [upstash.com](https://upstash.com/) and click **Create Database**.
2. Choose **Regional** type, select the same region as your Netlify site, and enable TLS.
3. From the database detail page, copy:
   - **REST URL** → this is `UPSTASH_REDIS_REST_URL`
   - **REST Token** → this is `UPSTASH_REDIS_REST_TOKEN`

### Step 3: Initialize the Production Database

Run these commands locally pointing at your Neon **direct** (non-pooled) connection string. The direct string is required because PgBouncer does not support DDL statements (`CREATE TABLE`, `CREATE TYPE`, etc.).

```bash
# Apply the full database schema
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require" npm run db:setup

# Seed the initial admin account and default settings
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require" npm run seed
```

After this step, switch to the **pooled** connection string for the `DATABASE_URL` environment variable in the Netlify UI (Step 5).

### Step 4: Push Code to GitHub

If not already in a Git repository:

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

If the repository already exists, just push your latest changes:

```bash
git add .
git commit -m "configure for production"
git push
```

### Step 5: Create and Configure the Netlify Site

1. Log in to [app.netlify.com](https://app.netlify.com/) and click **Add new site → Import an existing project**.
2. Connect your GitHub account and select your repository.
3. Netlify reads `netlify.toml` automatically. Confirm these build settings in the UI:
   - **Build command:** `npm run build`
   - **Publish directory:** `.next`
   - **Plugin:** `@netlify/plugin-nextjs` is installed automatically via `netlify.toml`
4. **Do not click Deploy yet.** Set environment variables first (Step 6).

### Step 6: Set Environment Variables in Netlify

Go to **Site configuration → Environment variables → Add a variable** and add all of the following:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string | e.g. `postgresql://user:pass@ep-xxx.pooler.neon.tech/dbname?sslmode=require` |
| `JWT_SECRET` | Long random secret | Generate with `openssl rand -hex 32`. App will not start without this. |
| `INTERNAL_CRON_SECRET` | Any secret string | Used to authenticate the Netlify scheduled function calling `/api/v1/internal/execute-code`. App will not start without this. |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL | Copied from Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | Copied from Upstash dashboard |
| `PISTON_API_URL` | Piston API endpoint | Optional. Defaults to `https://emkc.org/api/v2/piston`. Set if using a self-hosted Piston instance. |

> **`URL` is set automatically by Netlify** — it contains your site's public URL (e.g. `https://your-site.netlify.app`). The scheduled function uses it internally. Do not set it manually.

### Step 7: Deploy the Site

Click **Deploy site**. Netlify will:
1. Install dependencies (`npm install`)
2. Build the Next.js app (`npm run build`)
3. Publish the output using `@netlify/plugin-nextjs`

Watch the deploy log for errors. A successful deploy ends with **"Site is live"**.

### Step 8: Set Execution Mode to API-Only (Required)

Local child-process code execution is disabled on Netlify. After the first successful deploy:

1. Log in to your site as the teacher admin.
2. Go to **Settings → Platform Settings**.
3. Set **Execution Mode** to `API_ONLY`.
4. Save. All student code submissions will now route exclusively through the Piston API.

> If you skip this step, code execution will throw an error on Netlify whenever a student submits a coding question.

### Step 9: Verify the Deployment

Check these endpoints after deploy:

| Check | URL | Expected |
|---|---|---|
| Login page loads | `https://your-site.netlify.app/login` | Login form renders |
| Teacher login works | POST to `/api/v1/auth/login` | Returns `status: SUCCESS` |
| Platform settings API | GET `/api/v1/settings` | Returns settings JSON |

---

## How the Code Execution Worker Runs on Netlify

The file `netlify/functions/execute-code-cron.mts` is a Netlify Scheduled Function:

```ts
export const config: Config = {
  schedule: "* * * * *",  // every minute
};
```

Every minute, Netlify invokes this function. It sends a `POST` request with a `Bearer` token to `/api/v1/internal/execute-code`, which pops one job from the Upstash Redis queue, executes it via Piston, and writes the result back to Neon.

```
Netlify Scheduler
      │  (every minute)
      ▼
netlify/functions/execute-code-cron.mts
      │  POST /api/v1/internal/execute-code
      │  Authorization: Bearer <INTERNAL_CRON_SECRET>
      ▼
Next.js API Route
      │  rpop("code_execution_queue")  ← Upstash Redis (HTTPS REST)
      │  execute test cases via Piston API
      │  UPDATE submission_details     ← Neon PostgreSQL (WebSocket)
      ▼
Done
```

No additional configuration is needed — the scheduled function activates automatically on the first deploy.

---

## Architecture Overview

```
Browser
  │
  ▼
Netlify CDN / Edge
  │
  ├── Next.js Pages & API Routes (Netlify serverless functions)
  │     ├── Auth (JWT in HTTP-only cookies, IP-bound)
  │     ├── Teacher APIs  (exams, questions, monitor, settings)
  │     └── Student APIs
  │           ├── auto-save → upserts draft answers to Neon (transactional)
  │           ├── submit   → grades quiz + code, writes final result to Neon
  │           └── run-code → executes sample test cases via Piston API
  │
  ├── Neon PostgreSQL (WebSocket Pool — full transaction support)
  │
  ├── Upstash Redis (HTTPS REST — queue for async code execution jobs)
  │
  └── Netlify Scheduled Function (every 1 min)
        └── Pops job from Redis → Piston API → writes result to Neon
```
