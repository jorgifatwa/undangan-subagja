/*
 * ============================================================
 *  DATA UNDANGAN — edit file ini untuk mengganti isi undangan.
 *  Tanggal untuk kalender / file .ics ada di src/lib/weddingEvent.ts.
 *  Foto & musik ada di public/assets/ (path diawali "/assets/").
 * ============================================================
 */
export const WEDDING = {
  bride: {
    nick: "Annisa", // nama di cover (tulisan kuas) & penutup
    name: "Annisa Nurisma, S.T.", // nama di kartu mempelai
    parents: "Putri dari Bapak Asep Suryana & Ibu Enah",
    instagram: "annisanurism",
  },
  groom: {
    nick: "Rizki",
    name: "Rizki Subagja, S.T.",
    parents: "Putra dari Bapak B. Bunyamin Firman Abdullah & Ibu Endah Sekarwati",
    instagram: "ki.ws",
  },

  // Tanggal utama: hitung mundur, kalender, tanggal di cover (WIB)
  date: "2026-12-13T09:00:00+07:00",

  events: [
    { date: "2026-12-13", time: "Pukul 09.00 WIB", place: "Masjid Darushudur", maps: "https://maps.app.goo.gl/n5m34YkvnXbjivxU9" },
    { date: "2026-12-13", time: "Pukul 11.00 WIB - selesai", place: "Masjid Darushudur", maps: "https://maps.app.goo.gl/n5m34YkvnXbjivxU9" },
  ],

  photos: {
    cover: "/assets/img/cover.jpg", // foto di bingkai oval emas
    gallery: [
      "/assets/img/gallery-1.jpg",
      "/assets/img/gallery-2.jpg",
      "/assets/img/gallery-3.jpg",
      "/assets/img/gallery-4.jpg",
      "/assets/img/gallery-5.jpg",
      "/assets/img/gallery-6.jpg",
    ],
    strip: ["/assets/img/strip-1.jpg", "/assets/img/strip-2.jpg", "/assets/img/strip-3.jpg"], // photo strip di kartu mempelai
  },

  music: "/assets/audio/amin-paling-serius.m4a", // Sal Priadi & Nadin Amizah - Amin Paling Serius

  gift: {
    // Template punya 2 kartu rekening; kartu yang tidak terisi disembunyikan
    banks: [{ label: "BANK BCA an. Rizki Subagja", number: "1831432018" }],
  },
};

export type Wedding = typeof WEDDING;
