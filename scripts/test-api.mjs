// Bug-hunting API test cases for every feature (wishes, guest list, settings, logins, desk PIN, QR check-in, calendar
// file, pages). Each case states the behaviour we want; FAIL lines are bugs. Rate limits are per IP, so every case
// sends its own X-Forwarded-For.
//
// Runs only against a local dev server (`pnpm run dev`): it adds test guests and wishes and sets the desk PIN to 135790,
// so back up data/ first and restore it afterwards.
// Usage: pnpm test:api   (or: node scripts/test-api.mjs [base] [admin user] [admin password]; defaults from .env.local)
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const base = process.argv[2] ?? "http://localhost:3000";
const adminUser = process.argv[3] ?? process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.argv[4] ?? process.env.ADMIN_PASSWORD ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`Refusing to run against ${base}: these tests write data. Use a local dev server.`);
  process.exit(1);
}

let ipCounter = 0;
const freshIp = () => `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
const jars = { admin: "", desk: "" };
const call = async (path, { method = "GET", body, raw, as, ip = freshIp(), headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(as ? { Cookie: jars[as] } : {}),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (as && setCookie.length) jars[as] = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
};
const show = (r) => `${r.status} ${r.text.slice(0, 160)}`;

// ---- setup: admin + desk sessions, test guests
let r = await call("/api/admin/login", { method: "POST", body: { username: adminUser, password: adminPassword }, as: "admin" });
check("admin login", r.status === 200, show(r));
await call("/api/admin/checkin-pin", { method: "PUT", body: { pin: "135790" }, as: "admin" });
r = await call("/api/checkin/session", { method: "POST", body: { pin: "135790" }, as: "desk" });
check("desk login", r.status === 200, show(r));
r = await call("/api/admin/guests", {
  method: "POST",
  as: "admin",
  body: {
    guests: [
      { name: "Bapak Ahmad (Kantor) / Keluarga", phone: "081234567001" },
      { name: "Grup Uji Coba", phone: "" },
      { name: "Ibu Sri Rahayu Wulandari Kusumaningrum & Keluarga Besar", phone: "081234567002" },
    ],
  },
});
check("add test guests", r.status === 201, show(r));
const [ahmad, group, longName] = r.json?.guests ?? [];

// ---- authorization: every admin / desk endpoint refuses anonymous requests
for (const [method, path] of [
  ["GET", "/api/admin/guests"],
  ["POST", "/api/admin/guests"],
  ["PATCH", "/api/admin/guests"],
  ["DELETE", "/api/admin/guests?id=x"],
  ["GET", "/api/admin/settings"],
  ["PUT", "/api/admin/settings"],
  ["GET", "/api/admin/wishes"],
  ["DELETE", "/api/admin/wishes?id=x"],
  ["GET", "/api/admin/checkin-pin"],
  ["PUT", "/api/admin/checkin-pin"],
  ["GET", "/api/checkin"],
  ["POST", "/api/checkin"],
  ["DELETE", "/api/checkin?id=x"],
]) {
  r = await call(path, { method, body: method === "GET" || method === "DELETE" ? undefined : {} });
  check(`anonymous ${method} ${path} -> 401`, r.status === 401, show(r));
}
// The desk session must not open admin endpoints
r = await call("/api/admin/guests", { as: "desk" });
check("desk session cannot read the admin guest list", r.status === 401, show(r));
// A forged desk cookie
r = await call("/api/checkin", { headers: { Cookie: "checkin_session=9999999999.deadbeef" } });
check("forged desk cookie -> 401", r.status === 401, show(r));

// ---- wishes
r = await call("/api/wishes", { method: "POST", raw: "{not json" });
check("wish: broken JSON -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", raw: "null" });
check("wish: null body -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: 123, message: "Selamat ya", attendance: "hadir" } });
check("wish: name not a string -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "Selamat menempuh hidup baru", attendance: "mungkin" } });
check("wish: unknown attendance -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "😊😊😊😊😊😊", attendance: "hadir" } });
check("wish: emoji-only message -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "Cek www.judi-online.xyz", attendance: "hadir" } });
check("wish: link -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "Selamat ya", attendance: "hadir", website: "x" } });
check("wish: honeypot filled -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "a".repeat(3) + " selamat".repeat(40), attendance: "hadir" } });
check("wish: message over 300 chars -> 400", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", body: { name: "Tes Uji", message: "Selamat ya", attendance: "hadir", guestId: "tidak-ada" } });
check("wish: unknown guest id -> 400", r.status === 400, show(r));

const sameIp = freshIp();
r = await call("/api/wishes", { method: "POST", ip: sameIp, body: { name: "<b>Tes</b> Uji", message: "Selamat menempuh hidup baru", attendance: "hadir" } });
check("wish: name with < > -> refused (not a name)", r.status === 400, show(r));
r = await call("/api/wishes", { method: "POST", ip: sameIp, body: { name: "Tes Uji Satu", message: "Selamat menempuh hidup baru", attendance: "hadir" } });
check("wish: valid -> 201", r.status === 201, show(r));
check("wish: response hides the guest id", r.json && !("guestId" in r.json.wish), show(r));
r = await call("/api/wishes", { method: "POST", ip: sameIp, body: { name: "Tes Uji Satu", message: "Selamat sekali lagi ya", attendance: "hadir" } });
check("wish: second within 20 s from one IP -> 429", r.status === 429, show(r));

// Personal guest whose admin-given name has characters the form doesn't allow: the wish must still go through
r = await call("/api/wishes", { method: "POST", body: { name: "Penyusup", message: "Selamat menempuh hidup baru", attendance: "hadir", guestId: ahmad?.id } });
check("wish: personal guest with ( ) / in the name can send", r.status === 201, show(r));
check("wish: personal guest's name comes from the list", r.json?.wish?.name === ahmad?.name, show(r));
// Long admin name (over the form's 40) still works
r = await call("/api/wishes", { method: "POST", body: { name: "x", message: "Selamat menempuh hidup baru", attendance: "tidak_hadir", guestId: longName?.id } });
check("wish: personal guest with a long name can send", r.status === 201, show(r));
// A member writing from a group link must not overwrite the group invitation's own RSVP
r = await call("/api/wishes", { method: "POST", body: { name: "Anggota Grup", message: "Selamat menempuh hidup baru", attendance: "tidak_hadir", guestId: group?.id } });
check("wish: from a group link -> 201 with the typed name", r.status === 201 && r.json?.wish?.name === "Anggota Grup", show(r));
r = await call("/api/admin/guests", { as: "admin" });
const groupAfter = r.json?.guests.find((g) => g.id === group?.id);
check("wish: group invitation's attendance not set by one member", !groupAfter?.attendance, JSON.stringify(groupAfter));
const ahmadAfter = r.json?.guests.find((g) => g.id === ahmad?.id);
check("wish: personal guest's attendance recorded", ahmadAfter?.attendance === "hadir", JSON.stringify(ahmadAfter));

r = await call("/api/wishes");
check("wishes list hides guest ids", r.status === 200 && r.json.wishes.every((w) => !("guestId" in w)), show(r));

// ---- wish guest lookup
r = await call(`/api/wishes/guest?g=${ahmad?.id}`);
check("guest lookup: personal -> locked", r.json?.locked === true, show(r));
r = await call(`/api/wishes/guest?g=${group?.id}`);
check("guest lookup: group -> not locked", r.json?.locked === false, show(r));
r = await call(`/api/wishes/guest`);
check("guest lookup: no id -> 404", r.status === 404, show(r));

// ---- admin guests
r = await call("/api/admin/guests", { method: "POST", as: "admin", body: { guests: [] } });
check("guests: empty list -> 400", r.status === 400, show(r));
r = await call("/api/admin/guests", { method: "POST", as: "admin", body: { guests: Array.from({ length: 501 }, (_, i) => ({ name: `Tamu ${i}` })) } });
check("guests: 501 at once -> 400", r.status === 400, show(r));
r = await call("/api/admin/guests", { method: "POST", as: "admin", body: { guests: [{ name: "A" }] } });
check("guests: one-letter name -> 400", r.status === 400, show(r));
r = await call("/api/admin/guests", { method: "POST", as: "admin", body: { guests: [{ name: "Tamu Nomor Aneh", phone: "12" }] } });
check("guests: invalid phone -> 400", r.status === 400, show(r));
r = await call("/api/admin/guests", { method: "POST", as: "admin", body: { guests: "bukan array" } });
check("guests: guests not an array -> 400", r.status === 400, show(r));
r = await call("/api/admin/guests", { method: "PATCH", as: "admin", body: { id: "tidak-ada", sent: true } });
check("guests: patch unknown id -> 404", r.status === 404, show(r));
r = await call("/api/admin/guests", { method: "PATCH", as: "admin", body: { id: ahmad?.id, phone: "081234567099" } });
check("guests: patch only the phone keeps the name", r.status === 200 && r.json?.guest?.name === ahmad?.name, show(r));
r = await call("/api/admin/guests", { method: "PATCH", as: "admin", body: { id: ahmad?.id, sent: true } });
check("guests: mark sent", r.status === 200 && Boolean(r.json?.guest?.sentAt), show(r));
r = await call("/api/admin/guests?id=", { method: "DELETE", as: "admin" });
check("guests: delete without id -> 400", r.status === 400, show(r));

// ---- settings
r = await call("/api/admin/settings", { method: "PUT", as: "admin", body: { template: "Halo {nama}, tanpa tautan" } });
check("settings: template without {link} -> 400", r.status === 400, show(r));
r = await call("/api/admin/settings", { method: "PUT", as: "admin", body: { template: "x".repeat(4001) + "{link}" } });
check("settings: template over 4000 -> 400", r.status === 400, show(r));

// ---- desk PIN
r = await call("/api/admin/checkin-pin", { method: "PUT", as: "admin", body: { pin: 135790 } });
check("pin: number instead of string -> 400", r.status === 400, show(r));
r = await call("/api/admin/checkin-pin", { method: "PUT", as: "admin", body: { pin: "1234567" } });
check("pin: 7 digits -> 400", r.status === 400, show(r));
// Several committee phones on one venue Wi-Fi (one IP) logging in with the right PIN must never be locked out
const venueIp = freshIp();
let lockedOut = false;
for (let i = 0; i < 12; i++) {
  r = await call("/api/checkin/session", { method: "POST", ip: venueIp, body: { pin: "135790" } });
  if (r.status !== 200) lockedOut = true;
}
check("pin: 12 correct logins from one IP are all accepted", !lockedOut, show(r));
// ...while guessing is still capped
const guessIp = freshIp();
let capped = false;
for (let i = 0; i < 15; i++) {
  r = await call("/api/checkin/session", { method: "POST", ip: guessIp, body: { pin: String(100000 + i) } });
  if (r.status === 429) capped = true;
}
check("pin: guessing from one IP gets capped", capped, show(r));
r = await call("/api/checkin/session", { method: "POST", ip: guessIp, body: { pin: "135790" } });
check("pin: once capped, even the right PIN waits", r.status === 429, show(r));

// ---- QR pass + desk
r = await call("/api/pass", { method: "POST", body: { name: "   " } });
check("pass: blank name -> 400", r.status === 400, show(r));
r = await call("/api/pass", { method: "POST", body: { name: "x".repeat(81) } });
check("pass: 81 chars -> 400", r.status === 400, show(r));
r = await call("/api/pass", { method: "POST", raw: "[]" });
check("pass: array body -> 400", r.status === 400, show(r));

// Ten phones submitting the same name in the same group at the same moment: exactly one may get it
const sameName = await Promise.all(Array.from({ length: 10 }, () => call("/api/pass", { method: "POST", body: { name: "Rani Balapan", group: group?.id } })));
const created = sameName.filter((x) => x.status === 201).length;
check("pass: same name sent 10x at once -> exactly one created", created === 1, `created ${created}: ${sameName.map((x) => x.status).join(",")}`);

r = await call("/api/pass", { method: "POST", body: { name: "Tamu QR Uji", group: group?.id } });
const pass = r.json;
// Ten desk phones scanning the same QR at once: one "check-in berhasil", the rest "sudah check-in"
const scans = await Promise.all(Array.from({ length: 10 }, () => call("/api/checkin", { method: "POST", as: "desk", body: { id: pass?.id } })));
const fresh = scans.filter((x) => x.json?.already === false).length;
check("desk: same QR scanned 10x at once -> one fresh check-in", fresh === 1, `fresh ${fresh}`);
r = await call("/api/checkin", { method: "POST", as: "desk", body: { id: group?.id } });
check("desk: scanning the group invitation itself -> 400", r.status === 400, show(r));
r = await call("/api/checkin", { method: "POST", as: "desk", body: { id: 12345 } });
check("desk: id not a string -> 400", r.status === 400, show(r));
r = await call("/api/checkin?id=tidak-ada", { method: "DELETE", as: "desk" });
check("desk: undo unknown -> 404", r.status === 404, show(r));
r = await call("/api/checkin", { method: "POST", as: "desk", body: { name: "Grup Uji Coba" } });
check("desk: walk-in may share a group invitation's name", r.status === 201, show(r));
const walkIns = await Promise.all(Array.from({ length: 6 }, () => call("/api/checkin", { method: "POST", as: "desk", body: { name: "Tamu Dadakan Sama" } })));
check("desk: same walk-in added from 6 phones at once -> one entry", walkIns.filter((x) => x.status === 201).length === 1, walkIns.map((x) => x.status).join(","));
r = await call("/api/checkin", { as: "desk" });
check("desk list excludes group invitations", r.status === 200 && !r.json.guests.some((g) => g.id === group?.id), show(r));
check("desk list carries the group name", r.json?.guests.find((g) => g.id === pass?.id)?.group === "Grup Uji Coba", show(r));

// ---- calendar file
r = await call("/kalender.ics");
check("ics: text/calendar", (r.headers.get("content-type") ?? "").startsWith("text/calendar"), r.headers.get("content-type"));
check("ics: CRLF lines, folded at 75", r.text.includes("\r\n") && r.text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75), "");

// ---- pages
for (const path of ["/", "/details", "/admin", "/checkin", "/?to=%3Cscript%3Ealert(1)%3C%2Fscript%3E&g=x"]) {
  r = await call(path, { headers: { Accept: "text/html" } });
  check(`page ${path} -> 200`, r.status === 200, String(r.status));
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
