# Undangan Pernikahan Digital

Replika template Canva "Green Kids" (sudah dibeli), dengan tata letak workspace:
- **Desktop:** panel cover di kiri dan tampilan HP (430px) di kanan.
- **HP:** layar penuh.

## Cara edit
| Yang diubah | File |
|---|---|
| Nama, tanggal, acara, lokasi Maps, rekening, kontak, WhatsApp RSVP | `js/config.js` |
| Foto cover & 6 foto galeri, musik | taruh di `assets/img/`, tulis path-nya di `js/config.js` |
| Font komersial | lihat `assets/fonts/README.md` |

Nama tamu bisa ditampilkan lewat link: `index.html?to=Nama+Tamu`.

## Struktur
- `index.html`: cover dan 6 section (hasil render template).
- `css/template.css`: style template (dibuat otomatis, jangan diedit manual).
- `css/style.css`: layout workspace dan widget (hitung mundur, copy rekening, RSVP, musik).
- `js/main.js`: mengisi data dari config, skala layar, buka undangan, dan widget.
- `assets/template/`: ornamen dan gambar template.
