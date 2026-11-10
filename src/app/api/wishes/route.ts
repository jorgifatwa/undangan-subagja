import { connection } from "next/server";
import { getGuest, groupNamesByGuest, isGroupInvite, listGuests, updateGuest } from "@/lib/guestsStore";
import { addWish, listWishes, type Wish } from "@/lib/wishesStore";
import { clientIp, rateLimit } from "@/lib/db";
import { cleanText, isAttendance, validateWish } from "@/lib/wishValidation";
import { withErrors } from "@/lib/apiHandler";

// Against flooding, without blocking real guests: phones on Indonesian mobile networks often share one public IP, so
// the IP alone allows a generous number of wishes per minute; the same name from that IP waits 20 seconds (double taps)
const RATE_LIMIT_SECONDS = 20;
const IP_LIMIT_PER_MINUTE = 12;

// The guest id works as the key of a personal invitation link, so it never leaves the server. A wish sent from a group
// invitation's link shows as "Group - Name".
const publicWish = ({ id, name, message, attendance, createdAt, guestId }: Wish, groupNames: Map<string, string>) => {
  const group = guestId ? groupNames.get(guestId) : undefined;
  return { id, name: group ? `${group} - ${name}` : name, message, attendance, createdAt };
};

export const GET = withErrors(async () => {
  await connection(); // always read the latest wishes at request time
  const [wishes, guests] = await Promise.all([listWishes(), listGuests()]);
  const groupNames = groupNamesByGuest(guests);
  return Response.json({ wishes: wishes.map((wish) => publicWish(wish, groupNames)) });
});

export const POST = withErrors(async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Format data tidak valid." }, { status: 400 });
  }

  const { message, attendance, website, guestId } = (body ?? {}) as Record<string, unknown>;
  // From a personal link the wish is tied to the guest; for guests with a WhatsApp number the name also comes from the
  // guest list, whatever the form sent (those without one type their own name)
  const guest = typeof guestId === "string" && guestId ? await getGuest(guestId) : null;
  if (typeof guestId === "string" && guestId && !guest) {
    return Response.json({ error: "Link undangan tidak valid, silakan buka kembali link dari pesan WhatsApp." }, { status: 400 });
  }
  const lockedName = guest?.phone ? guest.name : null;
  const name = lockedName ?? (body as Record<string, unknown>)?.name;
  if (typeof name !== "string" || typeof message !== "string") {
    return Response.json({ error: "Nama dan ucapan wajib diisi." }, { status: 400 });
  }
  // Honeypot field: hidden from people, bots tend to fill it in
  if (typeof website === "string" && website.trim() !== "") {
    return Response.json({ error: "Ucapan tidak dapat dikirim." }, { status: 400 });
  }

  const error = validateWish({ name, message, attendance: typeof attendance === "string" ? attendance : "", nameFromGuestList: lockedName !== null });
  if (error || !isAttendance(attendance)) {
    return Response.json({ error: error ?? "Konfirmasi kehadiran tidak valid." }, { status: 400 });
  }

  const ip = clientIp(request);
  if (
    !(await rateLimit(`wish:${ip}:${cleanText(name).toLowerCase()}`, 1, RATE_LIMIT_SECONDS)) ||
    !(await rateLimit(`wish:${ip}`, IP_LIMIT_PER_MINUTE, 60))
  ) {
    return Response.json({ error: "Tunggu sebentar sebelum mengirim ucapan lagi." }, { status: 429 });
  }

  const wish = await addWish(cleanText(name), message.trim().replace(/\n{3,}/g, "\n\n"), attendance, guest?.id);
  // A group invitation's RSVP isn't one member's answer
  if (guest && !isGroupInvite(guest)) await updateGuest(guest.id, { attendance, respondedAt: wish.createdAt });
  return Response.json({ wish: publicWish(wish, groupNamesByGuest(guest ? await listGuests() : [])) }, { status: 201 });
});
