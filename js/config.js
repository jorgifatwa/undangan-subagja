/*
 * ============================================================
 *  DATA UNDANGAN — cukup edit file ini.
 *  Foto & musik taruh di folder assets/ lalu tulis path-nya.
 *  Kosongkan ("") jika belum ada, nanti tampil placeholder.
 * ============================================================
 */
window.WEDDING = {
  bride: {
    nick: 'Bride',
    name: 'The Bride',
    parents: 'Putri dari Bapak ... & Ibu ...',
    photo: '',            // contoh: 'assets/img/bride.jpg'
    instagram: '',        // contoh: 'https://instagram.com/username'
  },
  groom: {
    nick: 'Groom',
    name: 'The Groom',
    parents: 'Putra dari Bapak ... & Ibu ...',
    photo: '',
    instagram: '',
  },

  // Tanggal utama untuk hitung mundur & kalender (format: YYYY-MM-DDTHH:mm, waktu WIB)
  date: '2026-12-19T09:00',

  events: [
    {
      title: 'Akad',
      date: '2026-12-19',
      time: 'Pukul 09.00 - 10.00 WIB',
      place: 'KUA Ambarawa',
      maps: 'https://maps.google.com/?q=KUA+Ambarawa',
    },
    {
      title: 'Resepsi',
      date: '2026-12-19',
      time: 'Pukul 11.00 WIB - selesai',
      place: 'Balai Dusun Puser, Pasekan, Ambarawa',
      maps: 'https://maps.google.com/?q=Ambarawa',
    },
  ],

  cover: '',              // foto cover, contoh: 'assets/img/cover.jpg'
  gallery: [              // contoh: 'assets/img/g1.jpg'
    '', '', '', '', '', '',
  ],
  music: '',              // contoh: 'assets/music.mp3'

  gift: {
    banks: [
      { bank: 'BANK BCA', number: '8888998888', name: 'Bride' },
      { bank: 'BANK Mandiri', number: '88882288222', name: 'Groom' },
    ],
    address: 'Alamat pengiriman hadiah ...',
    contacts: [
      { name: 'Hani', phone: '0821 1903 4138' },
      { name: 'Yudi', phone: '0858 8043 5652' },
    ],
  },

  // Nomor WhatsApp tujuan RSVP (format 62xxxx)
  rsvpWhatsapp: '6282119034138',
};
