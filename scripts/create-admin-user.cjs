/**
 * Create the initial admin user via the running API server.
 * Run: node scripts/create-admin-user.cjs
 * Requires: API server running on port 3001
 *
 * This script uses the database connection from the running API server
 * by directly importing the db module.
 */

// Use the workspace db module directly
const path = require("path");

async function main() {
  // Set up the environment
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

  try {
    // Import the db module from the workspace
    const { db } = require(path.join(__dirname, "..", "lib", "db", "src", "index.ts"));

    // Check existing users
    const existing = await db.execute(
      "SELECT id, email, role FROM public.users WHERE email = 'admin@localhost'"
    );

    if (existing.rows && existing.rows.length > 0) {
      console.log("✅ Admin user already exists:", existing.rows[0]);
      return;
    }

    // Create admin user
    const result = await db.execute(
      `INSERT INTO public.users (id, email, role, created_at, updated_at)
       VALUES (gen_random_uuid(), 'admin@localhost', 'admin', NOW(), NOW())
       RETURNING id, email, role`
    );

    console.log("✅ Admin user created:", result.rows[0]);
    console.log("   Email: admin@localhost");
    console.log("   Password: devpassword123");
    console.log("   Login at: http://localhost:5174");
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("   Make sure the database is accessible and migrations have been run.");
  }
}

main();
