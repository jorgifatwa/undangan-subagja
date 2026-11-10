import "server-only";
import { randomUUID } from "crypto";
import { readJson, updateJson } from "./jsonStore";
import { getDb, toIso } from "./db";
import type { Attendance } from "./wishValidation";

// Invitation guest list (with the QR check-in at the venue) and the WhatsApp message settings. Postgres tables `guests` (insertion order) and `settings`
// (JSON value under the "invite" key); locally without a database: data/guests.json and data/settings.json.

// Where a guest entry came from: added in the admin, took a check-in QR from a group / general link, added at the
// desk, or added in the admin's guest list for a paper invitation (e.g. the parents' guests: no link, no number,
// optionally filed under a group). An admin entry without a WhatsApp number is a group invitation (its link is shared
// in a WhatsApp group), not a person: each member who opens it takes a QR under their own name.
export type GuestSource = "admin" | "self" | "desk" | "paper";

export const isGroupInvite = (guest: Pick<Guest, "phone" | "source">) => (guest.source ?? "admin") === "admin" && !guest.phone;

// Name of the WhatsApp group behind each guest id that wishes can come from: a group invitation itself, and the
// people who took a QR from it (their QR opens the invitation as them). Wishes show it before the name.
export const groupNamesByGuest = (guests: Guest[]): Map<string, string> => {
  const groups = new Map(guests.filter(isGroupInvite).map((guest) => [guest.id, guest.name]));
  const names = new Map(groups);
  for (const guest of guests) {
    const group = guest.groupId && groups.get(guest.groupId);
    if (group) names.set(guest.id, group);
  }
  return names;
};

export interface Guest {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  sentAt: string | null;
  // Set when the guest sends a wish from their personal link
  attendance?: Attendance | null;
  respondedAt?: string | null;
  // Missing on entries saved before the check-in existed (= "admin")
  source?: GuestSource;
  checkedInAt?: string | null;
  // "self" guests: the group invitation they came from (none for the general link); "paper" guests: the group they
  // were filed under, if any
  groupId?: string | null;
}

export interface InviteSettings {
  template: string;
}

export const DEFAULT_TEMPLATE = `Assalamu'alaikum Warahmatullahi Wabarakatuh

Kepada Yth.
Bapak/Ibu/Saudara/i
*{nama}*

Tanpa mengurangi rasa hormat, perkenankan kami mengundang Bapak/Ibu/Saudara/i untuk menghadiri acara pernikahan kami:

*Annisa Nurisma, S.T. & Rizki Subagja, S.T.*

Minggu, 13 Desember 2026
Masjid Darushudur

Berikut link undangan kami untuk info lengkap dari acara:
{link}

Merupakan suatu kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan untuk hadir dan memberikan doa restu.

Mohon maaf perihal undangan hanya dibagikan melalui pesan ini.

Terima kasih banyak atas perhatiannya.

Wassalamu'alaikum Warahmatullahi Wabarakatuh`;

const GUESTS = "guests";
const SETTINGS = "settings";
const SETTINGS_KEY = "invite";
const DEFAULT_SETTINGS: InviteSettings = { template: DEFAULT_TEMPLATE };

interface GuestRow {
  id: string;
  name: string;
  phone: string | null;
  created_at: Date;
  sent_at: Date | null;
  attendance: Attendance | null;
  responded_at: Date | null;
  source: GuestSource;
  checked_in_at: Date | null;
  group_id: string | null;
}

const fromRow = (row: GuestRow): Guest => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  createdAt: toIso(row.created_at)!,
  sentAt: toIso(row.sent_at),
  attendance: row.attendance,
  respondedAt: toIso(row.responded_at),
  source: row.source,
  checkedInAt: toIso(row.checked_in_at),
  groupId: row.group_id,
});

export const listGuests = async (): Promise<Guest[]> => {
  const sql = await getDb();
  if (sql) return (await sql<GuestRow[]>`select * from guests order by seq`).map(fromRow);
  return readJson<Guest[]>(GUESTS, []);
};

export const getGuest = async (id: string): Promise<Guest | null> => {
  const sql = await getDb();
  if (sql) {
    const [row] = await sql<GuestRow[]>`select * from guests where id = ${id}`;
    return row ? fromRow(row) : null;
  }
  return (await readJson<Guest[]>(GUESTS, [])).find((guest) => guest.id === id) ?? null;
};

// Names compare ignoring case and spacing
export const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

// Adds a person (QR taken from a group / general link, or added at the desk) unless someone in the same group already
// has exactly this name. Names only have to be unique within a group: the desk shows each member's group, so "Andi"
// of two groups can be told apart. Guests outside any group (personal invitations, the general link, added at the desk)
// share one scope. Group invitations themselves are not people and never count. Check and insert happen under one lock,
// so phones sending the same name at the same moment still get only one entry.
export const addPersonIfNameFree = async (
  name: string,
  { source, groupId = null, checkedIn = false }: { source: "self" | "desk" | "paper"; groupId?: string | null; checkedIn?: boolean },
): Promise<{ guest: Guest; taken: false } | { guest: Guest; taken: true }> => {
  const key = nameKey(name);
  const sameScope = (guest: Guest) => !isGroupInvite(guest) && (guest.groupId ?? null) === groupId && nameKey(guest.name) === key;
  const now = new Date().toISOString();
  const entry: Guest = { id: randomUUID(), name, phone: null, createdAt: now, sentAt: null, source, checkedInAt: checkedIn ? now : null, groupId };
  const sql = await getDb();
  if (sql) {
    return sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(727275, hashtext(${`${groupId ?? ""}|${key}`}))`;
      const rows = await tx<GuestRow[]>`select * from guests where lower(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g')) = ${key}`;
      const existing = rows.map(fromRow).find(sameScope);
      if (existing) return { guest: existing, taken: true as const };
      const [row] = await tx<GuestRow[]>`
        insert into guests (id, name, phone, source, checked_in_at, group_id)
        values (${entry.id}, ${name}, null, ${source}, ${entry.checkedInAt ?? null}, ${groupId})
        returning *
      `;
      return { guest: fromRow(row), taken: false as const };
    });
  }
  return updateJson<Guest[], { guest: Guest; taken: false } | { guest: Guest; taken: true }>(GUESTS, [], (guests) => {
    const existing = guests.find(sameScope);
    if (existing) return { data: guests, result: { guest: existing, taken: true } };
    return { data: [...guests, entry], result: { guest: entry, taken: false } };
  });
};

// Guests added in the admin (personal invitations, and group invitations: those without a number)
export const addGuests = async (entries: { name: string; phone: string | null }[]): Promise<Guest[]> => {
  const now = new Date().toISOString();
  const added: Guest[] = entries.map((entry) => ({
    id: randomUUID(),
    name: entry.name,
    phone: entry.phone,
    createdAt: now,
    sentAt: null,
    source: "admin",
    checkedInAt: null,
    groupId: null,
  }));
  const sql = await getDb();
  if (sql) {
    if (added.length === 0) return [];
    // One multi-row insert; the identity column keeps the list order (source etc. take their column defaults)
    const rows = await sql<GuestRow[]>`
      insert into guests ${sql(added.map(({ id, name, phone }) => ({ id, name, phone })), "id", "name", "phone")}
      returning *
    `;
    return rows.map(fromRow);
  }
  return updateJson<Guest[], Guest[]>(GUESTS, [], (guests) => ({ data: [...guests, ...added], result: added }));
};

type GuestChanges = Partial<Pick<Guest, "name" | "phone" | "sentAt" | "attendance" | "respondedAt" | "checkedInAt" | "groupId">>;

const COLUMNS: Record<keyof GuestChanges, string> = {
  name: "name",
  phone: "phone",
  sentAt: "sent_at",
  attendance: "attendance",
  respondedAt: "responded_at",
  checkedInAt: "checked_in_at",
  groupId: "group_id",
};

export const updateGuest = async (id: string, changes: GuestChanges): Promise<Guest | null> => {
  const sql = await getDb();
  if (sql) {
    const values = Object.fromEntries(
      (Object.keys(changes) as (keyof GuestChanges)[]).filter((field) => changes[field] !== undefined).map((field) => [COLUMNS[field], changes[field] ?? null]),
    );
    if (Object.keys(values).length === 0) return getGuest(id);
    const [row] = await sql<GuestRow[]>`update guests set ${sql(values)} where id = ${id} returning *`;
    return row ? fromRow(row) : null;
  }
  return updateJson<Guest[], Guest | null>(GUESTS, [], (guests) => {
    const current = guests.find((guest) => guest.id === id);
    if (!current) return { data: guests, result: null };
    const updated = { ...current, ...changes };
    return { data: guests.map((guest) => (guest.id === id ? updated : guest)), result: updated };
  });
};

// Marks every invitation as not sent yet (e.g. after test sends); returns how many were reset
export const resetAllSent = async (): Promise<number> => {
  const sql = await getDb();
  if (sql) return (await sql`update guests set sent_at = null where sent_at is not null`).count;
  return updateJson<Guest[], number>(GUESTS, [], (guests) => {
    const count = guests.filter((guest) => guest.sentAt).length;
    return { data: guests.map((guest) => (guest.sentAt ? { ...guest, sentAt: null } : guest)), result: count };
  });
};

export const deleteGuest = async (id: string): Promise<boolean> => {
  const sql = await getDb();
  if (sql) return (await sql`delete from guests where id = ${id}`).count > 0;
  return updateJson<Guest[], boolean>(GUESTS, [], (guests) => {
    const data = guests.filter((guest) => guest.id !== id);
    return { data, result: data.length !== guests.length };
  });
};

export const getSettings = async (): Promise<InviteSettings> => {
  const sql = await getDb();
  let stored: Partial<InviteSettings> = {};
  if (sql) {
    const [row] = await sql<{ value: string }[]>`select value from settings where key = ${SETTINGS_KEY}`;
    if (row) stored = JSON.parse(row.value) as Partial<InviteSettings>;
  } else {
    stored = await readJson<Partial<InviteSettings>>(SETTINGS, {});
  }
  return { template: stored.template ?? DEFAULT_SETTINGS.template };
};

export const saveSettings = async (settings: InviteSettings): Promise<InviteSettings> => {
  const sql = await getDb();
  if (sql) {
    const value = JSON.stringify(settings);
    await sql`insert into settings (key, value) values (${SETTINGS_KEY}, ${value}) on conflict (key) do update set value = excluded.value`;
    return settings;
  }
  return updateJson<InviteSettings, InviteSettings>(SETTINGS, DEFAULT_SETTINGS, () => ({ data: settings, result: settings }));
};
