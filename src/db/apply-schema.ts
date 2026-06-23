import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

async function run() {
  console.log("Reading init.sql...");
  const sqlPath = path.join(process.cwd(), "init.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error(`init.sql not found at ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");

  console.log("Connecting to the database and applying schema...");
  const sql = postgres(connectionString);

  try {
    // Execute all statements
    await sql.unsafe(sqlContent);
    console.log("✅ Schema applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to apply schema:", error);
    process.exit(1);
  }
}

run();
