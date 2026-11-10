# Undangan Pernikahan Annisa & Rizki

Undangan digital (Next.js 16) memakai tampilan template Canva "Green Kids". Halaman admin dan fiturnya sama dengan undangan-jorgi-estetik.

- `/`: cover, lalu isi undangan setelah "Buka Undangan" (link personal: `/?to=Nama Tamu&g=<id>`)
- `/details`: isi undangan tanpa cover
- `/admin`: kelola ucapan, daftar tamu, kirim undangan WhatsApp, check-in (butuh password)
- `/checkin`: halaman penerima tamu untuk panitia (scan QR, masuk dengan PIN)

## Mengganti isi undangan

| Yang diubah | File |
| --- | --- |
| Nama, orang tua, Instagram, jadwal, lokasi Maps, rekening, foto, musik | `src/invitation/config.ts` |
| Tanggal & lokasi untuk Google Calendar / file `.ics` | `src/lib/weddingEvent.ts` |
| Template pesan WhatsApp default | `src/lib/guestsStore.ts` (bisa juga diubah dari `/admin`) |
| Judul & deskripsi pratinjau link | `src/app/layout.tsx`, gambar: `src/app/opengraph-image.jpg` |
| Foto (cover, galeri, photo strip) | `public/assets/img/` |
| Font komersial | lihat `public/assets/fonts/README.md` |

## Menjalankan di lokal

```bash
pnpm install
cp .env.example .env.local   # isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET
pnpm dev
```

Tanpa `DATABASE_URL`, data (ucapan, tamu, template WhatsApp) disimpan sebagai file JSON di folder `data/` (tidak ikut ke git).

## Deploy ke Vercel

1. Import repository ini di [vercel.com/new](https://vercel.com/new) (terdeteksi otomatis sebagai Next.js + pnpm).
2. **Storage → Create Database → Neon** (Postgres gratis, region Singapore), lalu **Connect** ke project. `DATABASE_URL` terisi otomatis.
   Tanpa database, ucapan dan data admin **tidak bisa disimpan** di Vercel.
3. **Settings → Environment Variables**:
   - `ADMIN_USERNAME`: opsional, default `admin`
   - `ADMIN_PASSWORD`: password admin (minimal 8 karakter)
   - `ADMIN_SESSION_SECRET`: teks acak panjang, misalnya hasil `openssl rand -hex 32`
   - `NEXT_PUBLIC_SITE_URL`: opsional, hanya jika memakai domain sendiri
4. **Redeploy** setelah menambah database atau variabel.
5. Buka `/admin`, lalu login.

Tabel database dan akun admin pertama dibuat otomatis saat request pertama. Untuk mengganti password akun yang sudah ada, jalankan `DATABASE_URL="postgres://..." pnpm db:seed -- admin passwordbaru`.

## Pengujian

`pnpm test:api` (atau `node scripts/test-api.mjs http://localhost:3000`) menjalankan uji semua fitur API terhadap server lokal. Uji ini menambah data, jadi cadangkan folder `data/` dulu.

## Struktur

| Lokasi | Isi |
| --- | --- |
| `src/invitation/` | Halaman undangan: markup template (`index.html` → `markup.generated.ts` lewat `node scripts/build-markup.mjs`), runtime `main.js`, `config.ts` |
| `src/components/RsvpWidget.tsx` | RSVP & ucapan di kartu renda (Attending / Not Attending, Guest Wall, QR check-in) |
| `src/app/api/` | API ucapan, QR tamu, penerima tamu, admin |
| `src/lib/` | Validasi, autentikasi admin, penyimpanan (Postgres / file JSON) |
| `public/css/template.css` | Style template hasil render Canva (jangan diedit manual) |
| `public/css/style.css` | Layout workspace desktop, widget, photo strip |
| `public/assets/` | Ornamen template, foto, font |
