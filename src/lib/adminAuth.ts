import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { DEFAULT_ADMIN_USERNAME, findDatabaseUrl, verifyPassword } from "./dbShared.mjs";

// Admin accounts live in the Postgres table admin_users (seeded from ADMIN_USERNAME / ADMIN_PASSWORD, see db.ts and
// scripts/seed.mjs). Without a database the single account is ADMIN_USERNAME / ADMIN_PASSWORD from the environment.
// A login gives a signed, expiring token in an httpOnly cookie, keyed by ADMIN_SESSION_SECRET.

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const envUsername = () => process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
const envPassword = () => process.env.ADMIN_PASSWORD ?? "";
// The database URL is secret too, so it can sign sessions when no dedicated secret is set
const signingKey = () => process.env.ADMIN_SESSION_SECRET || envPassword() || findDatabaseUrl() || "";

// Whether anyone can log in: an admin account exists (database) or ADMIN_PASSWORD is set (no database)
export const isAdminConfigured = async () => {
  if (!signingKey()) return false;
  const sql = await getDb();
  if (sql) return (await sql`select 1 from admin_users limit 1`).length > 0;
  return envPassword().length > 0;
};

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("hex");

const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

export const checkCredentials = async (username: string, password: string) => {
  const sql = await getDb();
  if (sql) {
    const [user] = await sql<{ password_hash: string }[]>`select password_hash from admin_users where username = ${username.trim()}`;
    return Boolean(user) && verifyPassword(password, user.password_hash);
  }
  return envPassword().length > 0 && safeEqual(username.trim(), envUsername()) && safeEqual(password, envPassword());
};

export const createSessionToken = () => {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${sign(String(expires))}`;
};

const verifySessionToken = (token: string | undefined) => {
  if (!token || !signingKey()) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) * 1000 < Date.now()) return false;
  return safeEqual(signature, sign(expires));
};

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export const isAdminRequest = async () => verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);

export const unauthorized = () => Response.json({ error: "Sesi admin berakhir, silakan login kembali." }, { status: 401 });
