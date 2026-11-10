import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { addGuests, addPersonIfNameFree, deleteGuest, getGuest, isGroupInvite, listGuests, nameKey, resetAllSent, updateGuest, type Guest } from "@/lib/guestsStore";
import { normalizePhone } from "@/lib/phone";
import { cleanText } from "@/lib/wishValidation";
import { withErrors } from "@/lib/apiHandler";

const NAME_MAX = 80;

// Validates one {name, phone} entry; phone is optional (the WhatsApp contact can then be picked when sending)
const parseEntry = (raw: unknown): { name: string; phone: string | null } | string => {
  const { name, phone } = (raw ?? {}) as { name?: unknown; phone?: unknown };
  const cleanName = typeof name === "string" ? cleanText(name) : "";
  if (cleanName.length < 2 || cleanName.length > NAME_MAX) return `Nama tamu harus 2-${NAME_MAX} karakter.`;
  if (typeof phone !== "string" || phone.trim() === "") return { name: cleanName, phone: null };
  const normalized = normalizePhone(phone);
  return normalized ? { name: cleanName, phone: normalized } : `Nomor WhatsApp "${phone}" tidak valid.`;
};

const cleanName = (raw: unknown, what: string): string | { error: string } => {
  const name = typeof raw === "string" ? cleanText(raw) : "";
  return name.length < 2 || name.length > NAME_MAX ? { error: `${what} harus 2-${NAME_MAX} karakter.` } : name;
};

// The group a person is filed under: an existing group invitation (`groupId`), a new one by name (`newGroup`; a group
// of that name already on the list is reused rather than doubled), or none. Undefined when neither field was sent.
const resolveGroup = async (body: { groupId?: unknown; newGroup?: unknown }, all: Guest[]): Promise<string | null | undefined | { error: string }> => {
  if (typeof body.newGroup === "string" && body.newGroup.trim()) {
    const name = cleanName(body.newGroup, "Nama grup");
    if (typeof name !== "string") return name;
    const existing = all.find((guest) => isGroupInvite(guest) && nameKey(guest.name) === nameKey(name));
    if (existing) return existing.id;
    const [group] = await addGuests([{ name, phone: null }]);
    return group.id;
  }
  if (body.groupId === null || body.groupId === "") return null;
  if (typeof body.groupId === "string") {
    return all.some((guest) => guest.id === body.groupId && isGroupInvite(guest)) ? body.groupId : { error: "Grup tidak ditemukan, muat ulang daftar." };
  }
  return undefined;
};

// Someone else in the same group (or, without a group, among the guests outside any group) already has this name
const nameTaken = (all: Guest[], name: string, groupId: string | null, exceptId?: string) =>
  all.find((guest) => guest.id !== exceptId && !isGroupInvite(guest) && (guest.groupId ?? null) === groupId && nameKey(guest.name) === nameKey(name));

const takenError = (name: string) =>
  Response.json({ error: `"${name}" sudah ada di daftar dengan grup yang sama. Pakai nama yang berbeda (misalnya tambahkan keterangan).` }, { status: 409 });

export const GET = withErrors(async () => {
  if (!(await isAdminRequest())) return unauthorized();
  return Response.json({ guests: await listGuests() });
});

export const POST = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const { guests, person } = ((await request.json().catch(() => ({}))) ?? {}) as { guests?: unknown; person?: unknown };

  // One paper-invitation guest from the guest list, optionally filed under a group (existing or new)
  if (person && typeof person === "object") {
    const body = person as { name?: unknown; groupId?: unknown; newGroup?: unknown };
    const name = cleanName(body.name, "Nama tamu");
    if (typeof name !== "string") return Response.json(name, { status: 400 });
    // A refused name never leaves an empty group behind: a group is only created new when none has its name, and a
    // new group has nobody whose name could clash
    const groupId = await resolveGroup(body, await listGuests());
    if (groupId && typeof groupId === "object") return Response.json(groupId, { status: 400 });
    const { guest, taken } = await addPersonIfNameFree(name, { source: "paper", groupId: groupId ?? null });
    if (taken) return takenError(guest.name);
    return Response.json({ guest }, { status: 201 });
  }

  if (!Array.isArray(guests) || guests.length === 0 || guests.length > 500) {
    return Response.json({ error: "Kirim 1-500 tamu sekaligus." }, { status: 400 });
  }
  const entries = guests.map(parseEntry);
  const errors = entries.map((entry, idx) => (typeof entry === "string" ? `Baris ${idx + 1}: ${entry}` : null)).filter(Boolean);
  if (errors.length) return Response.json({ error: errors.join("\n") }, { status: 400 });
  const added = await addGuests(entries as { name: string; phone: string | null }[]);
  return Response.json({ guests: added }, { status: 201 });
});

export const PATCH = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    id?: unknown;
    name?: unknown;
    phone?: unknown;
    sent?: unknown;
    groupId?: unknown;
    newGroup?: unknown;
    resetSent?: unknown;
  };
  // "Reset semua status": every invitation back to "Belum dikirim"
  if (body.resetSent === "all") return Response.json({ reset: await resetAllSent() });
  if (typeof body.id !== "string") return Response.json({ error: "ID tamu wajib diisi." }, { status: 400 });

  const current = await getGuest(body.id);
  if (!current) return Response.json({ error: "Tamu tidak ditemukan." }, { status: 404 });

  const changes: { name?: string; phone?: string | null; sentAt?: string | null; groupId?: string | null } = {};
  if (body.name !== undefined || body.phone !== undefined) {
    // Fields left out keep their current value
    const entry = parseEntry({ name: body.name ?? current.name, phone: body.phone !== undefined ? body.phone : (current.phone ?? "") });
    if (typeof entry === "string") return Response.json({ error: entry }, { status: 400 });
    Object.assign(changes, entry);
  }
  if (typeof body.sent === "boolean") changes.sentAt = body.sent ? new Date().toISOString() : null;

  // People not invited personally (paper, group / general link, desk) can be moved to another group; their names stay
  // unique within their group, as when they were added
  if ((current.source ?? "admin") !== "admin") {
    const all = await listGuests();
    const creating = typeof body.newGroup === "string" && body.newGroup.trim() !== "";
    // An existing group is checked before anything is written; a new one (created last) has no members to clash with
    const existingGroup = creating ? undefined : await resolveGroup(body, all);
    if (existingGroup && typeof existingGroup === "object") return Response.json(existingGroup, { status: 400 });
    const name = changes.name ?? current.name;
    const target = existingGroup === undefined ? (current.groupId ?? null) : existingGroup;
    if (!creating && nameTaken(all, name, target, current.id)) return takenError(name);
    const groupId = creating ? await resolveGroup(body, all) : existingGroup;
    if (groupId && typeof groupId === "object") return Response.json(groupId, { status: 400 });
    // A "new" group whose name was already on the list is that existing group: its members still count
    if (creating && nameTaken(all, name, groupId ?? null, current.id)) return takenError(name);
    if (groupId !== undefined) changes.groupId = groupId;
  }

  const guest = await updateGuest(body.id, changes);
  return guest ? Response.json({ guest }) : Response.json({ error: "Tamu tidak ditemukan." }, { status: 404 });
});

export const DELETE = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "ID tamu wajib diisi." }, { status: 400 });
  return (await deleteGuest(id)) ? Response.json({ ok: true }) : Response.json({ error: "Tamu tidak ditemukan." }, { status: 404 });
});
