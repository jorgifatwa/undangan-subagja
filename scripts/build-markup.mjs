// Ubah src/invitation/index.html (hasil render template Canva) menjadi modul TS yang dirender halaman "/".
// Jalankan ulang setelah mengubah index.html:  node scripts/build-markup.mjs
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/invitation/index.html", import.meta.url), "utf8");
const rootClass = (src.match(/<html[^>]*class="([^"]*)"/) || [, ""])[1];
const start = src.indexOf('<div class="workspace">');
const end = src.indexOf('<audio id="bgm"');
if (start < 0 || end < 0) throw new Error("Penanda workspace/audio tidak ditemukan di index.html");

const markup = src
  .slice(start, end)
  .trim()
  // path relatif -> absolut, supaya tetap benar di route mana pun
  .replace(/(src|href)="assets\//g, '$1="/assets/');

const out = `// FILE HASIL GENERATE dari src/invitation/index.html — jangan diedit manual (jalankan: node scripts/build-markup.mjs)
export const ROOT_CLASS = ${JSON.stringify(rootClass)};
export const MARKUP = ${JSON.stringify(markup)};
`;
fs.writeFileSync(new URL("../src/invitation/markup.generated.ts", import.meta.url), out);
console.log("markup KB", Math.round(markup.length / 1024));
