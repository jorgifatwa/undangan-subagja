(function () {
  'use strict';
  var W = window.WEDDING;
  var DESIGN_W = 430, COVER_H = 764.444;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var day = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };

  var phone = $('#phone'), cover = $('#cover'), details = $('#details');
  var main = new Date(W.date);
  var fmtDay = function (d) { return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); };
  var couple = W.bride.nick + ' & ' + W.groom.nick;

  // ============ 1. Skala: desain 430px -> lebar layar ============
  function layout() {
    var w = phone.clientWidth, h = phone.clientHeight || window.innerHeight;
    details.firstElementChild.style.zoom = w / DESIGN_W;
    var ch = cover.clientHeight || h;
    var s = Math.max(w / DESIGN_W, ch / COVER_H);
    cover.firstElementChild.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', layout);
  layout();

  // ============ 2. Ganti teks dari config ============
  // teks asli di template -> teks baru
  var TEXT = [
    ['14/11/2026', pad(main.getDate()) + '/' + pad(main.getMonth() + 1) + '/' + main.getFullYear()],
    ['The Bride', W.bride.name],
    ['The Groom', W.groom.name],
    ['Putri dari Bapak & Ibu', W.bride.parents],
    ['Putra dari Bapak & Ibu', W.groom.parents],
    ['Oktober', BULAN[main.getMonth()]],
    ['22 oktober 2026', fmtDay(day(W.events[0].date))],
    ['Pukul 12:00-13:00 WIB', W.events[0].time],
    ['KUA Ambarawa', W.events[0].place],
    ['25 Oktober 2026', fmtDay(day(W.events[1].date))],
    ['Pukul 09.00 WIB -selesai', W.events[1].time],
    ['Balai dusun puser pasekan Ambarawa', W.events[1].place],
    ['BANK BCA an. Bride', W.gift.banks[0].label],
    ['8888998888', W.gift.banks[0].number],
    ['BANK Mandiri an. Groom', W.gift.banks[1].label],
    ['88882288222', W.gift.banks[1].number],
    ['0821 1903 4138', W.gift.contacts[0].phone],
    ['Hani', W.gift.contacts[0].name],
    ['0858 8043 5652', W.gift.contacts[1].phone],
    ['Yudi', W.gift.contacts[1].name],
    ['Bride & Groom', couple],
  ];
  var LETTERS = [['Bride', W.bride.nick], ['Groom', W.groom.nick]];

  $$('.stage p').forEach(function (p) {
    var t = norm(p.textContent);
    var spans = $$('span', p);
    if (!spans.length) return;
    // teks per huruf (judul kuas di cover)
    if (spans.every(function (s) { return s.classList.contains('jfNO9A'); })) {
      // lebar huruf dikunci untuk font asli; buat otomatis agar font pengganti tidak renggang
      spans.forEach(function (s) { s.style.width = 'auto'; });
      LETTERS.forEach(function (L) {
        if (t.replace(/ /g, '') !== L[0] || L[0] === L[1]) return;
        var tpl = spans[0];
        p.innerHTML = '';
        L[1].split('').forEach(function (ch) {
          var s = tpl.cloneNode(false);
          s.style.width = 'auto';
          s.textContent = ch === ' ' ? ' ' : ch;
          p.appendChild(s);
        });
      });
      return;
    }
    TEXT.forEach(function (T) {
      if (t !== norm(T[0]) || T[0] === T[1]) return;
      spans[0].textContent = T[1];
      spans.slice(1).forEach(function (s) { s.remove(); });
    });
  });

  // ============ 3. Kalender: minggu yang memuat tanggal acara ============
  var monday = new Date(main.getFullYear(), main.getMonth(), main.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  // urutan kolom template: Senin=19 ... Minggu=25
  $$('[data-cal]').forEach(function (el) {
    var col = +el.dataset.cal - 19;
    var d = new Date(monday); d.setDate(monday.getDate() + col);
    var span = $('span', el) || el;
    span.textContent = d.getDate();
  });
  // pindahkan sorotan (kolom Sabtu di template) ke hari acara — dipanggil setelah halaman tampil
  function moveHighlight() {
    var shift = ((main.getDay() + 6) % 7) - 5; // 5 = Sabtu
    if (!shift) return;
    var marker = $('[data-cal="24"]');
    var hl = marker && findHighlight(marker);
    if (hl) hl.style.marginLeft = (shift * colWidth()) + 'px';
  }
  function colWidth() {
    var a = $('[data-cal="19"]'), b = $('[data-cal="20"]');
    if (!a || !b) return 0;
    var z = parseFloat(details.firstElementChild.style.zoom) || 1;
    return (b.getBoundingClientRect().left - a.getBoundingClientRect().left) / z;
  }
  function findHighlight(marker) {
    // elemen gambar/bentuk yang menumpuk tepat di belakang angka "24"
    var r = marker.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null;
    $$('.stage .DF_utQ').forEach(function (el) {
      if (el.contains(marker) || el.querySelector('p')) return;
      var b = el.getBoundingClientRect();
      if (b.width < 15 || b.width > 90) return;
      if (cx > b.left && cx < b.right && cy > b.top && cy < b.bottom) best = el;
    });
    return best;
  }

  // ============ 4. Link Google Maps ============
  $$('.stage a[href*="maps"]').forEach(function (a, i) {
    var ev = W.events[i] || W.events[W.events.length - 1];
    if (ev && ev.maps) a.href = ev.maps;
    a.target = '_blank'; a.rel = 'noopener';
  });

  // ============ 5. Foto ============
  function swapPhoto(file, src) {
    if (!src) return;
    $$('img[src$="' + file + '"]').forEach(function (img) {
      var box = img.parentElement;           // .Izwocg (crop transform)
      box.style.width = '100%'; box.style.height = '100%'; box.style.transform = 'none';
      img.style.cssText += ';width:100%;height:100%;object-fit:cover';
      img.src = src;
    });
  }
  swapPhoto('437440eb32d2a85f1c7d462179d92128.png', W.photos.cover);
  ['ebf27f722497c2a3d9bddfbfef2a84e9.jpg', '5e58cf630e86bd88360ab5d13a1a8f24.jpg', 'c9ffc257bee7f549e3a7798bbc8cd47b.jpg',
    '9abeae4dd1ec6197e7e5e73bc351e9ee.jpg', 'd366f0402762a99a6c2cc9a8ec154ffd.jpg', '5b4dddd417f7af8511d70cdc8ab653be.jpg']
    .forEach(function (f, i) { swapPhoto(f, W.photos.gallery[i]); });

  // ============ 6. Widget ============
  var toast = $('#toast'), toastT;
  function showToast(m) { toast.textContent = m; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('show'); }, 1800); }

  // 6a. musik
  var audio = $('#bgm'), musicBtn = $('#musicBtn');
  var vinyl = null;
  var setPlaying = function (on) {
    musicBtn.classList.toggle('playing', on);
    if (vinyl) vinyl.classList.toggle('vinyl-spin', on);
  };
  var toggleMusic = function () {
    if (!W.music) { showToast('Musik belum diatur di config.js'); return; }
    if (audio.paused) audio.play().then(function () { setPlaying(true); }).catch(function () {});
    else { audio.pause(); setPlaying(false); }
  };
  if (W.music) { audio.src = W.music; musicBtn.hidden = false; }
  musicBtn.addEventListener('click', toggleMusic);

  $$('[data-widget="music"]').forEach(function (slot) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'w-music'; b.setAttribute('aria-label', 'Putar / jeda musik');
    b.addEventListener('click', toggleMusic);
    slot.innerHTML = '<div></div>';
    slot.firstChild.appendChild(b);
    // piringan hitam = gambar bundar di dekat slot
    var sr = slot.getBoundingClientRect();
    $$('.stage img[src*="46017cbd"]').forEach(function (im) { vinyl = im.closest('.DF_utQ') || im; });
    if (!vinyl) $$('.stage img').forEach(function (im) { var r = im.getBoundingClientRect(); if (Math.abs(r.top - sr.top) < 60 && Math.abs(r.left - sr.left) < 120) vinyl = vinyl || im; });
  });

  // 6b. hitung mundur
  $$('[data-widget="countdown"]').forEach(function (slot) {
    slot.innerHTML = '<div class="w-countdown">' +
      ['Days', 'Hours', 'Minutes', 'Seconds'].map(function (l, i) {
        return (i ? '<span class="sep">:</span>' : '') + '<div class="u"><b data-cd="' + i + '">00</b><small>' + l + '</small></div>';
      }).join('') + '</div>';
  });
  var cds = $$('[data-cd]');
  function tick() {
    var s = Math.max(0, Math.floor((main - new Date()) / 1000));
    var v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    cds.forEach(function (el) { el.textContent = pad(v[+el.dataset.cd]); });
  }
  tick(); setInterval(tick, 1000);

  // 6c. tombol copy rekening (urutan slot = urutan rekening)
  var COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';
  $$('[data-widget="copy"]').forEach(function (slot, i) {
    var bank = W.gift.banks[i];
    if (!bank) return;
    slot.innerHTML = '<div class="w-copy"><button type="button">' + COPY_ICON + 'Copy</button></div>';
    var btn = $('button', slot);
    btn.addEventListener('click', function () {
      var num = bank.number.replace(/\s/g, '');
      var ok = function () { btn.classList.add('done'); btn.lastChild.textContent = 'Copied'; showToast('Nomor rekening disalin'); setTimeout(function () { btn.classList.remove('done'); btn.lastChild.textContent = 'Copy'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(num).then(ok, function () { showToast(num); });
      else showToast(num);
    });
  });

  // 6d. RSVP
  var guest = new URLSearchParams(location.search).get('to') || '';
  $$('[data-widget="rsvp"]').forEach(function (slot) {
    var ev = W.events[W.events.length - 1];
    slot.innerHTML =
      '<div class="w-rsvp">' +
      '<h3>' + esc(couple.toLowerCase()) + '</h3>' +
      '<p class="date">' + esc(fmtDay(day(ev.date))) + '</p>' +
      '<div class="choice">' +
      '<button type="button" data-a="Hadir"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>Attending</button>' +
      '<button type="button" data-a="Tidak Hadir"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>Not Attending</button>' +
      '</div>' +
      '<form><input name="name" placeholder="Nama" required value="' + esc(guest) + '"><textarea name="msg" rows="2" placeholder="Ucapan & doa"></textarea><button type="submit">Kirim via WhatsApp</button></form>' +
      '<p class="wall-title">Guest Wall</p>' +
      '<div class="wall"><p class="empty">Kirim ucapan Anda melalui tombol di atas.</p></div>' +
      '</div>';
    var attend = '';
    var form = $('form', slot);
    $$('.choice button', slot).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.choice button', slot).forEach(function (x) { x.classList.toggle('on', x === b); });
        attend = b.dataset.a; form.classList.add('open'); form.name.focus();
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = 'Halo, saya ' + form.name.value + '.\nKonfirmasi kehadiran: ' + attend + (form.msg.value ? '\nUcapan: ' + form.msg.value : '');
      window.open('https://wa.me/' + W.rsvpWhatsapp + '?text=' + encodeURIComponent(text), '_blank');
    });
  });

  // Slot embed ada di dalam wrapper Canva yang diskalakan (transform: scale s).
  // Ukuran yang tersimpan di slot = ukuran VISUAL iframe asli (dalam px desain 430).
  // Jadi: ukuran CSS slot = visual / s, dan isi widget dibuat di ukuran visual lalu di-scale 1/s.
  function fitWidgets() {
    var z = parseFloat(details.firstElementChild.style.zoom) || 1;
    $$('.embed-slot').forEach(function (slot) {
      var w = slot.firstElementChild;
      if (!w) return;
      if (!slot.dataset.vw) { slot.dataset.vw = slot.offsetWidth; slot.dataset.vh = slot.offsetHeight; }
      var vw = +slot.dataset.vw, vh = +slot.dataset.vh;
      slot.style.width = vw + 'px'; slot.style.height = vh + 'px';
      var s = (slot.getBoundingClientRect().width / z) / vw;   // skala wrapper Canva
      if (!s || !isFinite(s)) return;
      slot.style.width = (vw / s) + 'px'; slot.style.height = (vh / s) + 'px';
      w.style.position = 'absolute'; w.style.left = '0'; w.style.top = '0';
      w.style.width = vw + 'px'; w.style.height = vh + 'px';
      w.style.transform = 'scale(' + (1 / s) + ')';
      w.style.transformOrigin = '0 0';
    });
  }
  window.addEventListener('resize', fitWidgets);

  // ============ 7. Panel desktop ============
  $$('[data-k]').forEach(function (el) {
    var k = el.dataset.k;
    if (k === 'bride.nick') el.textContent = W.bride.nick;
    else if (k === 'groom.nick') el.textContent = W.groom.nick;
    else if (k === 'dateShort' && el.closest('.side')) el.textContent = pad(main.getDate()) + '/' + pad(main.getMonth() + 1) + '/' + main.getFullYear();
  });
  if (guest) { var sg = $('#sideGuest'); sg.hidden = false; $('b', sg).textContent = guest; }
  document.title = 'The Wedding Of ' + couple;

  // ============ 8. Animasi muncul per elemen ============
  var revealEls = $$('#details section ._mXnjA > .DF_utQ');
  revealEls.forEach(function (el) { el.classList.add('reveal'); });
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.1 }) : null;

  // ============ 9. Buka undangan ============
  $$('#cover a[href^="#page"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (W.music) audio.play().then(function () { setPlaying(true); }).catch(function () {});
      cover.classList.add('is-leaving');
      setTimeout(function () {
        cover.hidden = true;                     // cover disembunyikan
        details.hidden = false;
        document.body.classList.remove('locked');
        phone.scrollTop = 0; window.scrollTo(0, 0);
        layout();
        moveHighlight();
        fitWidgets();
        if (io) revealEls.forEach(function (el) { io.observe(el); });
        else revealEls.forEach(function (el) { el.classList.add('in'); });
      }, 700);
    });
  });
})();
