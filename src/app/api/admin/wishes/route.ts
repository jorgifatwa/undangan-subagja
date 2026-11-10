import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { deleteWish, listWishes } from "@/lib/wishesStore";
import { groupNamesByGuest, listGuests } from "@/lib/guestsStore";
import { withErrors } from "@/lib/apiHandler";

export const GET = withErrors(async () => {
  if (!(await isAdminRequest())) return unauthorized();
  const [wishes, guests] = await Promise.all([listWishes(Number.MAX_SAFE_INTEGER), listGuests()]);
  const groupNames = groupNamesByGuest(guests);
  // `name` stays as typed (the guest list matches RSVPs on it); `group` is the WhatsApp group it was sent from
  return Response.json({ wishes: wishes.map((wish) => ({ ...wish, group: (wish.guestId && groupNames.get(wish.guestId)) || null })) });
});

export const DELETE = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "ID ucapan wajib diisi." }, { status: 400 });
  const deleted = await deleteWish(id);
  return deleted ? Response.json({ ok: true }) : Response.json({ error: "Ucapan tidak ditemukan." }, { status: 404 });
});
