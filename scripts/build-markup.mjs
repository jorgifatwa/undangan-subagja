// Ubah src/invitation/index.html (hasil render template Canva) menjadi modul TS yang dirender halaman "/".
// Jalankan ulang setelah mengubah index.html:  node scripts/build-markup.mjs
import fs from "node:fs";
import { createHash } from "node:crypto";

const src = fs.readFileSync(new URL("../src/invitation/index.html", import.meta.url), "utf8");
const rootClass = (src.match(/<html[^>]*class="([^"]*)"/) || [, ""])[1];
const start = src.indexOf('<div class="workspace">');
const end = src.indexOf('<audio id="bgm"');
if (start < 0 || end < 0) throw new Error("Penanda workspace/audio tidak ditemukan di index.html");

let markup = src
  .slice(start, end)
  .trim()
  // path relatif -> absolut, supaya tetap benar di route mana pun
  .replace(/(src|href)="assets\//g, '$1="/assets/');

// Gambar di isi undangan dimuat lazy: banyak elemen template disembunyikan (diganti susunan baru di main.js), dan
// gambar lazy di dalam elemen display:none tidak pernah diunduh. Cover tetap eager (tampil pertama).
const detailsAt = markup.indexOf('id="details"');
if (detailsAt < 0) throw new Error('Penanda id="details" tidak ditemukan');
markup = markup.slice(0, detailsAt) + markup.slice(detailsAt).replace(/<img (?![^>]*\bloading=)/g, '<img loading="lazy" decoding="async" ');

// Markup dikirim sebagai file statis terpisah (dimuat browser setelah halaman terbuka), bukan di dalam HTML halaman:
// HTML halaman tetap kecil (~25 KB), sehingga crawler pratinjau link (WhatsApp, Facebook) membacanya dengan cepat.
const version = createHash("sha1").update(markup).digest("hex").slice(0, 10);
fs.writeFileSync(new URL("../public/invitation-markup.html", import.meta.url), markup);
const out = `// FILE HASIL GENERATE dari src/invitation/index.html — jangan diedit manual (jalankan: node scripts/build-markup.mjs)
export const ROOT_CLASS = ${JSON.stringify(rootClass)};
export const MARKUP_URL = ${JSON.stringify("/invitation-markup.html?v=" + version)};
`;
fs.writeFileSync(new URL("../src/invitation/markup.generated.ts", import.meta.url), out);
console.log("markup KB", Math.round(markup.length / 1024));
