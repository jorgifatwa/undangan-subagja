/*
 * ============================================================
 *  DATA UNDANGAN — cukup edit file ini.
 *  Foto & musik: taruh di folder assets/ lalu tulis path-nya.
 *  Kosongkan ("") untuk memakai foto contoh dari template.
 * ============================================================
 */
window.WEDDING = {
  bride: {
    nick: 'Bride',                         // nama di cover (tulisan kuas)
    name: 'The Bride',                     // nama di kartu mempelai
    parents: 'Putri dari Bapak ... & Ibu ...',
  },
  groom: {
    nick: 'Groom',
    name: 'The Groom',
    parents: 'Putra dari Bapak ... & Ibu ...',
  },

  // Tanggal utama: hitung mundur, kalender, tanggal di cover (format YYYY-MM-DDTHH:mm)
  date: '2026-12-19T09:00',

  events: [
    {
      date: '2026-12-19',
      time: 'Pukul 09.00 - 10.00 WIB',
      place: 'KUA Ambarawa',
      maps: 'https://maps.app.goo.gl/4aY1XZWACMEgwoke9',
    },
    {
      date: '2026-12-19',
      time: 'Pukul 11.00 WIB - selesai',
      place: 'Balai dusun puser pasekan Ambarawa',
      maps: 'https://maps.app.goo.gl/4aY1XZWACMEgwoke9',
    },
  ],

  // Foto: ganti dengan foto Anda. Urutan galeri = urutan di template (6 foto).
  photos: {
    cover: '',        // foto di bingkai oval emas, contoh 'assets/img/cover.jpg'
    gallery: ['', '', '', '', '', ''],
  },

  music: '',          // contoh 'assets/music.mp3'

  gift: {
    banks: [
      { label: 'BANK BCA an. Bride', number: '8888998888' },
      { label: 'BANK Mandiri  an. Groom', number: '88882288222' },
    ],
    contacts: [
      { name: 'Hani', phone: '0821 1903 4138' },
      { name: 'Yudi', phone: '0858 8043 5652' },
    ],
  },

  // Nomor WhatsApp tujuan konfirmasi RSVP (format 62xxxx)
  rsvpWhatsapp: '6282119034138',
};
