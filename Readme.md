# ITLearn Enterprise Platform - Online Quiz & Hybrid Coding System Update

A secure, high-performance web platform designed for hosting software testing exams, quizzes, and automated multi-language code execution assessments. Built with Next.js App Router, Tailwind CSS v4, Drizzle ORM, Neon Serverless PostgreSQL, and Upstash Redis.

---

## Key Features

- **Interactive Student Exam Workspace:** Real-time countdown timer, side-by-side multiple choice selections, and a full-featured code editor.
- **Asynchronous Code Execution Queue:** Student code submissions are pushed to a Redis queue and graded asynchronously against test cases via sandboxed environments.
- **Teacher / Admin Dashboard:** Manage questions (add, edit, delete), assign exams, review focus loss analytics, monitor live student exam progress, and grade history.
- **Anti-Cheat Monitoring:** Captures browser tab focus switches and triggers alerts in the monitor screen.
- **Bespoke UI styling:** Premium dark glassmorphic components, Bricolage Grotesque display headers, Plus Jakarta Sans text, and custom background radial glows matching the ITLearn brand design.

---

## Tech Stack

- **Framework:** Next.js (React 19, TypeScript)
- **Styling:** Tailwind CSS v4, Framer Motion
- **Database:** Neon Serverless PostgreSQL
- **ORM:** Drizzle ORM
- **Cache/Queue:** Upstash Redis
- **Authentication:** JWT sessions stored in secure HTTP-only cookies

---

## Local Development Setup

### 1. Configure Local Environment Variables
Create a `.env` file in the root folder using this template:
```env
# 1. PostgreSQL Connection String (Neon local or docker instance)
DATABASE_URL="postgresql://username:password@127.0.0.1:5432/db_name"

# 2. JWT Authentication Secret (Generate a secure random string)
JWT_SECRET="generate_a_secure_jwt_secret_key_string"

# 3. Upstash Redis REST Credentials (For background queue processing)
UPSTASH_REDIS_REST_URL="https://your-upstash-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_token_here"

# 4. Cron Task Authorization Key
INTERNAL_CRON_SECRET="your-cron-auth-secret-token"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database Schema
Run the database setup script to apply schemas read from `init.sql`:
```bash
npm run db:setup
```

### 4. Seed Database
Seed default teacher, student, settings, exam configurations, and test cases:
```bash
npm run seed
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Seed Credentials

After running the seed script, you can log in using these default credentials:

### Student Account:
- **Student ID:** `20261102`
- **Password:** `password123`

### Teacher / Admin Account:
- **Teacher ID:** `teacher1`
- **Password:** `password123`

---

## Database Schema Operations

- **Database Setup script:** `npm run db:setup` (connects to the configured `DATABASE_URL` and applies `init.sql`).
- **Seeding script:** `npm run seed` (connects to `DATABASE_URL` and applies sample users, coding exercises, and multiple choice questions).

---

## Deployment Guide (Neon & Vercel)

### Step 1: Set Up Neon PostgreSQL
1. Sign in to [neon.tech](https://neon.tech/) and create a new project.
2. Select your PostgreSQL version and location region (closest to your planned Vercel site).
3. Copy the **Pooled Connection String** from your Neon project dashboard.

### Step 2: Set Up Upstash Redis
1. Sign in to [upstash.com](https://upstash.com/) and spin up a serverless Redis database.
2. Note down the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### Step 3: Run Database Migrations on Production
Migrate and seed your Neon database by running commands locally pointing to your production database string:
```bash
# Apply schemas
DATABASE_URL="your-neon-pooled-connection-string" npm run db:setup

# Seed initial admin and settings records
DATABASE_URL="your-neon-pooled-connection-string" npm run seed
```

### Step 4: Deploy to Vercel
1. Initialize a Git repository and push your project files to **GitHub**, **GitLab**, or **Bitbucket**.
2. Log in to [Vercel](https://vercel.com/) and create a new project, importing your git repository.
3. Configure the **Environment Variables** in Vercel settings:
   - `DATABASE_URL`: Your **Neon Pooled Connection String**
   - `JWT_SECRET`: A secure random secret string to sign user sessions
   - `UPSTASH_REDIS_REST_URL`: Your Upstash Redis URL
   - `UPSTASH_REDIS_REST_TOKEN`: Your Upstash Redis Token
   - `INTERNAL_CRON_SECRET`: A custom secret of your choice to secure the internal worker API
4. Click **Deploy**. Vercel will build your nextjs app and output your public URL.
5. Vercel will automatically configure the background cron scheduler (`/api/v1/internal/execute-code`) to run every minute as declared in the `vercel.json` file.
