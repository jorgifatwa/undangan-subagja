import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  addGuests,
  addPersonIfNameFree,
  deleteGuest,
  getGuest,
  isGroupInvite,
  listGuests,
  nameKey,
  resetAllSent,
  updateGuest,
  type Guest,
  type InviteType,
} from "@/lib/guestsStore";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { cleanText } from "@/lib/wishValidation";
import { withErrors } from "@/lib/apiHandler";

const NAME_MAX = 80;

const parseInviteType = (raw: unknown): InviteType | undefined => (raw === "pribadi" || raw === "grup" ? raw : undefined);

// Validates one {name, phone, inviteType} entry; phone is optional (the WhatsApp contact can then be picked when
// sending). Without an inviteType, an entry with a number is personal and one without is a group invitation. A group
// invitation never keeps a number: it is shared in a WhatsApp group, picked when sending.
const parseEntry = (raw: unknown): { name: string; phone: string | null; inviteType: InviteType } | string => {
  const { name, phone, inviteType } = (raw ?? {}) as { name?: unknown; phone?: unknown; inviteType?: unknown };
  const cleanName = typeof name === "string" ? cleanText(name) : "";
  if (cleanName.length < 2 || cleanName.length > NAME_MAX) return `Nama tamu harus 2-${NAME_MAX} karakter.`;
  const type = parseInviteType(inviteType);
  let normalized: string | null = null;
  if (type !== "grup" && typeof phone === "string" && phone.trim() !== "") {
    normalized = normalizePhone(phone);
    if (!normalized) return `Nomor WhatsApp "${phone}" tidak valid.`;
  }
  return { name: cleanName, phone: normalized, inviteType: type ?? (normalized ? "pribadi" : "grup") };
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
  const { guests, person, allowDuplicates } = ((await request.json().catch(() => ({}))) ?? {}) as {
    guests?: unknown;
    person?: unknown;
    allowDuplicates?: unknown;
  };

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
  const valid = entries as { name: string; phone: string | null; inviteType: InviteType }[];
  // A number already on the list is refused unless the admin chose "Tetap tambah" after seeing the warning. The admin
  // warns from its own copy of the list; this catches numbers someone else added meanwhile (e.g. from another phone).
  if (allowDuplicates !== true) {
    const owners = new Map((await listGuests()).filter((guest) => guest.phone).map((guest) => [guest.phone, guest.name]));
    const duplicates = valid.filter((entry) => entry.phone && owners.has(entry.phone)).map((entry) => ({ phone: entry.phone, name: owners.get(entry.phone) }));
    if (duplicates.length) {
      const [first] = duplicates;
      const more = duplicates.length > 1 ? ` (dan ${duplicates.length - 1} nomor lain)` : "";
      return Response.json(
        { error: `Nomor ${formatPhone(first.phone as string)} sudah tercatat atas nama "${first.name}"${more}. Daftar dimuat ulang, periksa lagi sebelum menambah.`, duplicates },
        { status: 409 },
      );
    }
  }
  const added = await addGuests(valid);
  return Response.json({ guests: added }, { status: 201 });
});

export const PATCH = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    id?: unknown;
    name?: unknown;
    phone?: unknown;
    inviteType?: unknown;
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

  const changes: { name?: string; phone?: string | null; sentAt?: string | null; groupId?: string | null; inviteType?: InviteType } = {};
  if (body.name !== undefined || body.phone !== undefined) {
    // Fields left out keep their current value
    const entry = parseEntry({ name: body.name ?? current.name, phone: body.phone !== undefined ? body.phone : (current.phone ?? "") });
    if (typeof entry === "string") return Response.json({ error: entry }, { status: 400 });
    changes.name = entry.name;
    changes.phone = entry.phone;
  }
  // Personal / group: only for invitations added in the admin
  if (body.inviteType !== undefined && (current.source ?? "admin") === "admin") {
    const inviteType = parseInviteType(body.inviteType);
    if (!inviteType) return Response.json({ error: "Jenis undangan harus pribadi atau grup." }, { status: 400 });
    // A group with people filed under it can't become a personal invitation: they would lose their group
    if (inviteType === "pribadi" && isGroupInvite(current)) {
      const members = (await listGuests()).filter((guest) => guest.groupId === current.id).length;
      if (members > 0) {
        return Response.json(
          { error: `Grup "${current.name}" punya ${members} anggota. Pindahkan atau hapus anggotanya dulu di Daftar Tamu.` },
          { status: 409 },
        );
      }
    }
    changes.inviteType = inviteType;
    if (inviteType === "grup") changes.phone = null;
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
