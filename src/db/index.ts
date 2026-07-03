import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// Use the WebSocket-based Pool so that db.transaction() is supported.
// The neon-http driver only fires independent HTTP requests and throws
// "No transactions support in neon-http driver" whenever a transaction is used.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
