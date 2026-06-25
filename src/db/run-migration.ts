import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env or .env.local");
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: tsx src/db/run-migration.ts <migration-file.sql>");
  process.exit(1);
}

async function run() {
  const sqlPath = path.isAbsolute(migrationFile)
    ? migrationFile
    : path.join(process.cwd(), "src/db/migrations", migrationFile);

  if (!fs.existsSync(sqlPath)) {
    console.error(`Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  console.log(`Running migration: ${path.basename(sqlPath)}`);

  const sql = postgres(connectionString);
  try {
    await sql.unsafe(sqlContent);
    console.log("✅ Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

run();
