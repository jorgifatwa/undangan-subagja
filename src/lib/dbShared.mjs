// Shared by the app (src/lib/db.ts) and the seed script (scripts/seed.mjs), so it is plain JavaScript.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Idempotent schema: safe to run on every cold start and from the seed script
export const SCHEMA_SQL = `
create table if not exists wishes (
  id text primary key,
  seq bigint generated always as identity,
  name text not null,
  message text not null,
  attendance text,
  guest_id text,
  created_at timestamptz not null default now()
);
create index if not exists wishes_seq_idx on wishes (seq desc);

create table if not exists guests (
  id text primary key,
  seq bigint generated always as identity,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attendance text,
  responded_at timestamptz
);
-- QR check-in at the venue. source: 'admin' (added in the admin), 'self' (took a QR from a group link),
-- 'desk' (added by the reception desk on the day), 'paper' (paper invitation, added in the admin's guest list)
alter table guests add column if not exists source text not null default 'admin';
alter table guests add column if not exists checked_in_at timestamptz;
-- For 'self' and 'paper' guests: the group invitation (an admin guest without a WhatsApp number) whose link they opened
alter table guests add column if not exists group_id text;

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists admin_users (
  id bigint generated always as identity primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
`;

// Vercel's Postgres integrations (Neon, Supabase, Prisma Postgres) set DATABASE_URL or POSTGRES_URL, with a custom
// prefix when one was chosen while connecting (e.g. STORAGE_DATABASE_URL)
export const findDatabaseUrl = (env = process.env) => {
  for (const name of ["DATABASE_URL", "POSTGRES_URL"]) {
    if (env[name]) return env[name];
    const prefixed = Object.keys(env).find((key) => key.endsWith(`_${name}`) && env[key]);
    if (prefixed) return env[prefixed];
  }
  return undefined;
};

// scrypt$<salt>$<hash>, hex encoded
export const hashPassword = (password) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
};

export const verifyPassword = (password, stored) => {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
};

export const DEFAULT_ADMIN_USERNAME = "admin";
