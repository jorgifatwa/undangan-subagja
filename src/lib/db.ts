import "server-only";
import postgres, { type Sql } from "postgres";
import { DEFAULT_ADMIN_USERNAME, SCHEMA_SQL, findDatabaseUrl, hashPassword } from "./dbShared.mjs";

// Postgres when DATABASE_URL / POSTGRES_URL is set (Vercel: Neon, Supabase or Prisma Postgres from the Marketplace),
// otherwise null so local development falls back to the JSON files in data/.
const url = findDatabaseUrl();

// prepare: false keeps it working behind transaction-mode poolers (Neon / Supabase pooled URLs)
const client: Sql | null = url ? postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }) : null;

let ready: Promise<Sql> | null = null;

// Creates the tables on first use and seeds the first admin account from ADMIN_USERNAME / ADMIN_PASSWORD, so a fresh
// database works after a deploy without running anything by hand (scripts/seed.mjs does the same from a terminal)
const prepare = async (sql: Sql) => {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`; // one instance at a time when several cold-start together
    await tx.unsafe(SCHEMA_SQL); // no args: sent with the simple protocol, so several statements are fine
    const password = process.env.ADMIN_PASSWORD;
    if (password) {
      const username = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
      await tx`
        insert into admin_users (username, password_hash)
        select ${username}, ${hashPassword(password)}
        where not exists (select 1 from admin_users)
      `;
    }
  });
  return sql;
};

// The ready-to-use client, or null without a database
export const getDb = async (): Promise<Sql | null> => {
  if (!client) return null;
  ready ??= prepare(client).catch((err) => {
    ready = null; // retry on the next request
    throw err;
  });
  return ready;
};

// Where data is saved: Postgres, local JSON files, or nowhere (Vercel without a database, where every write fails)
export const storageMode = (): "postgres" | "file" | "missing" => (client ? "postgres" : process.env.VERCEL ? "missing" : "file");

export const toIso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

const memoryHits = new Map<string, number[]>();

// Fixed-window rate limit; returns true when the action is allowed. Shared across serverless instances via Postgres.
export const rateLimit = async (id: string, limit: number, windowSeconds: number): Promise<boolean> => {
  const sql = await getDb();
  if (sql) {
    const [row] = await sql<{ count: number }[]>`
      insert into rate_limits (key, count, reset_at)
      values (${id}, 1, now() + make_interval(secs => ${windowSeconds}))
      on conflict (key) do update set
        count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
        reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
      returning count
    `;
    // Now and then drop long-expired windows so the table stays small
    if (Math.random() < 0.02) await sql`delete from rate_limits where reset_at < now() - interval '1 day'`;
    return row.count <= limit;
  }
  const now = Date.now();
  const hits = (memoryHits.get(id) ?? []).filter((t) => now - t < windowSeconds * 1000);
  if (hits.length >= limit) return false;
  memoryHits.set(id, [...hits, now]);
  return true;
};

// For logins: whether `id` still has attempts left, without using one up (record failures with rateLimit), so correct
// logins never lock anyone out
export const hasAttemptsLeft = async (id: string, limit: number, windowSeconds: number): Promise<boolean> => {
  const sql = await getDb();
  if (sql) {
    const [row] = await sql<{ count: number }[]>`select count from rate_limits where key = ${id} and reset_at >= now()`;
    return !row || row.count < limit;
  }
  const now = Date.now();
  return (memoryHits.get(id) ?? []).filter((t) => now - t < windowSeconds * 1000).length < limit;
};

export const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
