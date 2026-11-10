import { cookies } from "next/headers";
import { CHECKIN_COOKIE, checkPin, checkinCookieOptions, createCheckinToken, isCheckinRequest, isPinSet } from "@/lib/adminAuth";
import { clientIp, hasAttemptsLeft, rateLimit } from "@/lib/db";
import { withErrors } from "@/lib/apiHandler";

// Reception desk login with the shared PIN. A 6-digit PIN is short, so wrong PINs are capped per IP; correct ones never
// count, since the committee's phones often share the venue Wi-Fi (one IP).
const WINDOW_SECONDS = 10 * 60;
const MAX_FAILURES = 10;

export const GET = withErrors(async () => Response.json({ authenticated: await isCheckinRequest(), pinSet: await isPinSet() }));

export const POST = withErrors(async (request: Request) => {
  if (!(await isPinSet())) return Response.json({ error: "PIN panitia belum diatur oleh admin." }, { status: 503 });
  const key = `checkin-login:${clientIp(request)}`;
  const tooMany = () => Response.json({ error: "Terlalu banyak PIN salah, coba lagi dalam 10 menit." }, { status: 429 });
  if (!(await hasAttemptsLeft(key, MAX_FAILURES, WINDOW_SECONDS))) return tooMany();
  const { pin } = ((await request.json().catch(() => ({}))) ?? {}) as { pin?: unknown };
  if (typeof pin !== "string" || !(await checkPin(pin))) {
    await rateLimit(key, MAX_FAILURES, WINDOW_SECONDS);
    return Response.json({ error: "PIN salah." }, { status: 401 });
  }
  const token = await createCheckinToken();
  if (token) (await cookies()).set(CHECKIN_COOKIE, token, checkinCookieOptions);
  return Response.json({ ok: true });
});

export const DELETE = withErrors(async () => {
  (await cookies()).delete(CHECKIN_COOKIE);
  return Response.json({ ok: true });
});
