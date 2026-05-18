import { readFileSync } from "fs";
import { resolve } from "path";
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
import { db } from "../lib/db/src/index.js";

async function main() {
  const cols = await db.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position" as any
  );
  console.log(
    "Columns:",
    cols.rows.map((r: any) => r.column_name)
  );
  const users = await db.execute("SELECT id, email, role FROM public.users LIMIT 5" as any);
  console.log("Users:", users.rows);
  process.exit(0);
}
main();
