/**
 * Create the initial admin user in the database.
 * Run: npx tsx scripts/create-admin-user.ts
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env manually BEFORE any other imports
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Dynamic import after env is loaded
const { db } = await import("../lib/db/src/index.js");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@localhost";

async function main() {
  try {
    const existing = await db.execute(
      `SELECT id, email, role FROM public.users WHERE email = '${ADMIN_EMAIL}'` as any
    );

    if (existing.rows && existing.rows.length > 0) {
      console.log("✅ Admin user already exists:", existing.rows[0]);
      process.exit(0);
      return;
    }

    const result = await db.execute(
      `INSERT INTO public.users (id, email, role, created_at, updated_at)
       VALUES (gen_random_uuid(), '${ADMIN_EMAIL}', 'admin', NOW(), NOW())
       RETURNING id, email, role` as any
    );

    console.log("✅ Admin user created:", result.rows?.[0]);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log("   Login at: http://localhost:5174");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
