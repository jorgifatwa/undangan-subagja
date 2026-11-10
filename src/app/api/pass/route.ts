import { addPersonIfNameFree, getGuest, isGroupInvite } from "@/lib/guestsStore";
import { clientIp, rateLimit } from "@/lib/db";
import { cleanText } from "@/lib/wishValidation";
import { withErrors } from "@/lib/apiHandler";

const NAME_MAX = 80;

// A guest from a group link (or the general link) takes their own check-in QR: they become a guest entry (source
// "self", tied to the group invitation when there is one) whose id the QR carries. The invitation keeps it on the
// phone, so this runs once per guest. Names must be unique within the group, so the desk can tell guests apart. The
// cap (roomy, since guests on one office or venue Wi-Fi share an IP) stops anyone filling the list.
export const POST = withErrors(async (request: Request) => {
  if (!(await rateLimit(`pass:${clientIp(request)}`, 20, 10 * 60))) {
    return Response.json({ error: "Terlalu banyak permintaan, coba lagi sebentar lagi." }, { status: 429 });
  }
  const { name, group } = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown; group?: unknown };
  const cleanName = typeof name === "string" ? cleanText(name) : "";
  if (cleanName.length < 2 || cleanName.length > NAME_MAX) return Response.json({ error: `Nama harus 2-${NAME_MAX} karakter.` }, { status: 400 });

  const invite = typeof group === "string" && group ? await getGuest(group) : null;
  const groupId = invite && isGroupInvite(invite) ? invite.id : null;

  const { guest, taken } = await addPersonIfNameFree(cleanName, { source: "self", groupId });
  if (taken) {
    return Response.json(
      {
        error: `Nama "${cleanName}" sudah terdaftar${groupId ? " di grup ini" : ""}. Gunakan nama lain, misalnya tambahkan nama belakang atau asal Anda.`,
      },
      { status: 409 },
    );
  }
  return Response.json({ id: guest.id, name: guest.name }, { status: 201 });
});
