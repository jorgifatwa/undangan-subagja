import "server-only";
import { randomUUID } from "crypto";
import { readJson, updateJson } from "./jsonStore";
import { getDb, toIso } from "./db";
import type { Attendance } from "./wishValidation";

// Guest wishes, newest first. Postgres table `wishes`; locally without a database: data/wishes.json.

export interface Wish {
  id: string;
  name: string;
  message: string;
  attendance?: Attendance;
  // Guest list entry the wish was sent from (personal invitation link)
  guestId?: string;
  createdAt: string;
}

const FILE = "wishes";
const MAX_STORED = 2000;

interface WishRow {
  id: string;
  name: string;
  message: string;
  attendance: Attendance | null;
  guest_id: string | null;
  created_at: Date;
}

const fromRow = (row: WishRow): Wish => ({
  id: row.id,
  name: row.name,
  message: row.message,
  ...(row.attendance ? { attendance: row.attendance } : {}),
  ...(row.guest_id ? { guestId: row.guest_id } : {}),
  createdAt: toIso(row.created_at)!,
});

export const listWishes = async (limit = 200): Promise<Wish[]> => {
  const sql = await getDb();
  if (sql) {
    const rows = await sql<WishRow[]>`select * from wishes order by seq desc limit ${Math.min(limit, 100_000)}`;
    return rows.map(fromRow);
  }
  const wishes = await readJson<Wish[]>(FILE, []);
  return wishes.slice(0, limit);
};

export const addWish = async (name: string, message: string, attendance: Attendance, guestId?: string): Promise<Wish> => {
  const sql = await getDb();
  if (sql) {
    const [row] = await sql<WishRow[]>`
      insert into wishes (id, name, message, attendance, guest_id)
      values (${randomUUID()}, ${name}, ${message}, ${attendance}, ${guestId ?? null})
      returning *
    `;
    return fromRow(row);
  }
  const wish: Wish = { id: randomUUID(), name, message, attendance, ...(guestId ? { guestId } : {}), createdAt: new Date().toISOString() };
  return updateJson<Wish[], Wish>(FILE, [], (wishes) => ({ data: [wish, ...wishes].slice(0, MAX_STORED), result: wish }));
};

export const deleteWish = async (id: string): Promise<boolean> => {
  const sql = await getDb();
  if (sql) return (await sql`delete from wishes where id = ${id}`).count > 0;
  return updateJson<Wish[], boolean>(FILE, [], (wishes) => {
    const next = wishes.filter((wish) => wish.id !== id);
    return { data: next, result: next.length !== wishes.length };
  });
};
