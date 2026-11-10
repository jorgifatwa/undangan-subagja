// Creates the database tables and the admin account (or resets its password when it already exists).
//
//   pnpm db:seed                          uses DATABASE_URL, ADMIN_USERNAME and ADMIN_PASSWORD from .env.local
//   pnpm db:seed -- <username> <password> overrides the account from the command line
//
// Variables already set in the shell win over .env.local, e.g. DATABASE_URL="postgres://..." pnpm db:seed
import postgres from "postgres";
import { DEFAULT_ADMIN_USERNAME, SCHEMA_SQL, findDatabaseUrl, hashPassword } from "../src/lib/dbShared.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment
}

const [argUser, argPassword] = process.argv.slice(2).filter((arg) => arg !== "--");
const username = (argUser || process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
const password = argPassword || process.env.ADMIN_PASSWORD;
const url = findDatabaseUrl();

if (!url) {
  console.error("DATABASE_URL belum diatur (isi di .env.local atau jalankan dengan DATABASE_URL=... pnpm db:seed).");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("Password admin minimal 8 karakter (ADMIN_PASSWORD di .env.local, atau pnpm db:seed -- <username> <password>).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(SCHEMA_SQL);
  const [row] = await sql`
    insert into admin_users (username, password_hash)
    values (${username}, ${hashPassword(password)})
    on conflict (username) do update set password_hash = excluded.password_hash
    returning (xmax = 0) as created
  `;
  console.log(`${row.created ? "Akun admin dibuat" : "Password admin diperbarui"}: ${username}`);
} catch (err) {
  console.error("Seed gagal:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
