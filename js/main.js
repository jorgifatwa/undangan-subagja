(function () {
  'use strict';
  var W = window.WEDDING;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var parseDay = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };

  var main = new Date(W.date);
  var computed = {
    couple: W.bride.nick + ' & ' + W.groom.nick,
    dateShort: pad(main.getDate()) + ' / ' + pad(main.getMonth() + 1) + ' / ' + main.getFullYear(),
  };
  var get = function (path) {
    if (path in computed) return computed[path];
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, W);
  };

  // ---- isi teks & gambar dari config ----
  $$('[data-text]').forEach(function (el) { el.textContent = get(el.dataset.text) || ''; });
  $$('[data-bg]').forEach(function (el) {
    var src = get(el.dataset.bg);
    if (src) el.style.backgroundImage = 'url("' + src + '")';
    else el.classList.add('placeholder');
  });
  $$('[data-href]').forEach(function (el) {
    var url = get(el.dataset.href);
    if (!url) { el.remove(); return; }
    el.href = url;
    el.textContent = '@' + url.replace(/\/+$/, '').split('/').pop();
  });
  document.title = 'The Wedding Of ' + computed.couple;

  // ---- nama tamu dari URL: ?to=Nama+Tamu ----
  var to = new URLSearchParams(location.search).get('to');
  if (to) { $('#guestName').textContent = to; $('#rsvpName').value = to; }

  // ---- buka undangan ----
  var phone = $('#phone');
  var audio = $('#bgm');
  var musicBtn = $('#musicBtn');
  if (W.music) {
    audio.src = W.music;
    musicBtn.hidden = false;
  }
  var setPlaying = function (on) { musicBtn.classList.toggle('playing', on); };
  musicBtn.addEventListener('click', function () {
    if (audio.paused) audio.play().then(function () { setPlaying(true); }).catch(function () {});
    else { audio.pause(); setPlaying(false); }
  });
  $('#openBtn').addEventListener('click', function () {
    document.body.classList.remove('locked');
    var next = $('#cover').nextElementSibling;
    var top = next.offsetTop;
    if (phone.scrollHeight > phone.clientHeight) phone.scrollTo({ top: top, behavior: 'smooth' });
    else window.scrollTo({ top: top, behavior: 'smooth' });
    if (W.music) audio.play().then(function () { setPlaying(true); }).catch(function () {});
  });

  // ---- hitung mundur ----
  var cd = {};
  $$('[data-cd]').forEach(function (el) { cd[el.dataset.cd] = el; });
  var tick = function () {
    var diff = Math.max(0, main - new Date());
    var s = Math.floor(diff / 1000);
    cd.d.textContent = Math.floor(s / 86400);
    cd.h.textContent = pad(Math.floor(s / 3600) % 24);
    cd.m.textContent = pad(Math.floor(s / 60) % 60);
    cd.s.textContent = pad(s % 60);
  };
  tick(); setInterval(tick, 1000);

  // ---- kalender minggu acara ----
  $('#calMonth').textContent = BULAN[main.getMonth()];
  var start = new Date(main.getFullYear(), main.getMonth(), main.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // mulai Senin
  var eventDays = W.events.map(function (e) { return parseDay(e.date).toDateString(); });
  var week = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(start); d.setDate(start.getDate() + i);
    var on = eventDays.indexOf(d.toDateString()) > -1;
    week += '<div class="' + (on ? 'on' : '') + '"><span>' + HARI[d.getDay()] + '</span><b>' + d.getDate() + '</b></div>';
  }
  $('#calWeek').innerHTML = week;

  var ICON = {
    cal: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  };
  $('#events').innerHTML = W.events.map(function (e) {
    var d = parseDay(e.date);
    return '<div class="ev">' +
      '<h3>' + esc(e.title) + '</h3>' +
      '<p>' + ICON.cal + HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + '</p>' +
      '<p>' + ICON.clock + esc(e.time) + '</p>' +
      '<p>' + ICON.pin + esc(e.place) + '</p>' +
      (e.maps ? '<a class="btn btn--glass" href="' + esc(e.maps) + '" target="_blank" rel="noopener">' + ICON.pin + 'Petunjuk Lokasi</a>' : '') +
      '</div>';
  }).join('');

  // ---- galeri ----
  $('#gallery').innerHTML = W.gallery.map(function (src, i) {
    return src
      ? '<figure class="reveal"><img src="' + esc(src) + '" alt="Galeri ' + (i + 1) + '" loading="lazy"></figure>'
      : '<figure class="reveal placeholder"><span>Foto ' + (i + 1) + '</span></figure>';
  }).join('');

  // ---- gift ----
  $('#banks').innerHTML = W.gift.banks.map(function (b) {
    return '<div class="bank reveal"><span class="bank__name">' + esc(b.bank) + '</span>' +
      '<span class="bank__no">' + esc(b.number) + '</span>' +
      '<span class="small">a.n. ' + esc(b.name) + '</span>' +
      '<button class="btn btn--gold btn--sm" type="button" data-copy="' + esc(b.number) + '">Salin Nomor</button></div>';
  }).join('');
  $('#contacts').innerHTML = W.gift.contacts.map(function (c) {
    var wa = c.phone.replace(/\D/g, '').replace(/^0/, '62');
    return '<a class="contact" href="https://wa.me/' + wa + '" target="_blank" rel="noopener"><b>' + esc(c.name) + '</b>' + esc(c.phone) + '</a>';
  }).join('');

  var toast = $('#toast'), toastT;
  var showToast = function (msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (!b) return;
    var text = b.dataset.copy;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { showToast('Nomor disalin'); })
      .catch(function () { showToast(text); });
  });

  // ---- RSVP via WhatsApp ----
  $('#rsvpForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var text = 'Halo, saya ' + f.get('name') + '.\nKonfirmasi kehadiran: ' + f.get('attend') +
      (f.get('msg') ? '\nUcapan: ' + f.get('msg') : '');
    window.open('https://wa.me/' + W.rsvpWhatsapp + '?text=' + encodeURIComponent(text), '_blank');
  });

  // ---- animasi muncul saat discroll ----
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
})();
