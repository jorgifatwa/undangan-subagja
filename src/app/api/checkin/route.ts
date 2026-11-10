import { checkinUnauthorized, isCheckinRequest } from "@/lib/adminAuth";
import { addPersonIfNameFree, checkInGuest, getGuest, isGroupInvite, listGuests, updateGuest } from "@/lib/guestsStore";
import { cleanText } from "@/lib/wishValidation";
import { withErrors } from "@/lib/apiHandler";

const NAME_MAX = 80;

// Reception desk (PIN or admin): the people on the list (group invitations are not people; their members are listed
// with the group's name), checking a guest in by QR / from the list, adding a guest who is not on the list, and undoing
// a mistaken check-in

export const GET = withErrors(async () => {
  if (!(await isCheckinRequest())) return checkinUnauthorized();
  const all = await listGuests();
  const groupNames = new Map(all.filter(isGroupInvite).map((guest) => [guest.id, guest.name]));
  const guests = all
    .filter((guest) => !isGroupInvite(guest))
    .map(({ id, name, source, checkedInAt, groupId }) => ({
      id,
      name,
      source: source ?? "admin",
      checkedInAt: checkedInAt ?? null,
      group: (groupId && groupNames.get(groupId)) || null,
    }));
  return Response.json({ guests });
});

export const POST = withErrors(async (request: Request) => {
  if (!(await isCheckinRequest())) return checkinUnauthorized();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { id?: unknown; name?: unknown };

  if (typeof body.id === "string") {
    const target = await getGuest(body.id);
    if (target && isGroupInvite(target)) {
      return Response.json({ error: `Ini QR undangan grup "${target.name}". Minta tamu membuat QR atas namanya, atau cari namanya.` }, { status: 400 });
    }
    const result = await checkInGuest(body.id);
    return result ? Response.json(result) : Response.json({ error: "QR tidak dikenal: tamu tidak ada di daftar." }, { status: 404 });
  }

  const name = typeof body.name === "string" ? cleanText(body.name) : "";
  if (name.length < 2 || name.length > NAME_MAX) return Response.json({ error: `Nama tamu harus 2-${NAME_MAX} karakter.` }, { status: 400 });
  const { guest, taken } = await addPersonIfNameFree(name, { source: "desk", checkedIn: true });
  if (taken) return Response.json({ error: `"${guest.name}" sudah ada di daftar. Cari namanya, atau pakai nama yang berbeda.` }, { status: 409 });
  return Response.json({ guest, already: false }, { status: 201 });
});

export const DELETE = withErrors(async (request: Request) => {
  if (!(await isCheckinRequest())) return checkinUnauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const guest = id ? await updateGuest(id, { checkedInAt: null }) : null;
  return guest ? Response.json({ guest }) : Response.json({ error: "Tamu tidak ditemukan." }, { status: 404 });
});
