import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Use HTTP-based neon() instead of Pool so there are no persistent WebSocket
// connections. Each query is an independent HTTP request — no idle-socket
// "Unhandled error" crashes on Vercel/serverless environments.
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });

export type Database = typeof db;
