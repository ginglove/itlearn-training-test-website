import type { Config } from "@netlify/functions";

// Runs every minute — equivalent to Vercel's cron in vercel.json
export default async function handler() {
  const siteUrl = process.env.URL;
  const cronSecret = process.env.INTERNAL_CRON_SECRET;

  if (!siteUrl || !cronSecret) {
    console.error("Missing URL or INTERNAL_CRON_SECRET env vars");
    return;
  }

  try {
    const res = await fetch(`${siteUrl}/api/v1/internal/execute-code`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cronSecret}`,
        "content-type": "application/json",
      },
    });

    const data = await res.json();
    console.log("execute-code-cron result:", data);
  } catch (err) {
    console.error("execute-code-cron failed:", err);
  }
}

export const config: Config = {
  schedule: "* * * * *",
};
