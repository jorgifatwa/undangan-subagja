// Runtime undangan: mengisi data dari config ke markup template, skala layar, widget, dan buka undangan.
// Dipanggil sekali dari InvitationRuntime (komponen React) setelah markup ada di halaman.

import { createSakura } from "./sakura";

const DESIGN_W = 430;
const COVER_H = 764.444;
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const pad = (n) => String(n).padStart(2, "0");
const day = (s) => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const norm = (s) => s.replace(/\s+/g, " ").trim();
const fmtDay = (d) => d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear();

/**
 * @param {import("./config").Wedding} W
 * @param {{ mountRsvp: (el: HTMLElement) => void, showToast: (msg: string) => void, openGallery?: (i: number) => void, calendarUrl?: string }} hooks
 */
export function initInvitation(W, hooks) {
  const phone = $("#phone"), cover = $("#cover"), details = $("#details");
  document.body.classList.add("locked"); // cover terkunci sampai "Buka Undangan"
  const main = new Date(W.date);
  const couple = W.bride.nick + " & " + W.groom.nick;
  const zoomOf = () => {
    const w = details.firstElementChild.getBoundingClientRect().width;
    return w > 0 ? w / DESIGN_W : parseFloat(details.firstElementChild.style.zoom) || 1;
  };

  // ============ 1. Skala: desain 430px -> lebar layar ============
  function layout() {
    const w = phone.clientWidth, h = phone.clientHeight || window.innerHeight;
    details.firstElementChild.style.zoom = w / DESIGN_W;
    const ch = cover.clientHeight || h;
    // mengikuti lebar layar (nama tidak terpotong); sisa tinggi diisi tekstur daun di latar .pg--cover
    const s = Math.min(w / DESIGN_W, ch / COVER_H);
    cover.firstElementChild.style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }
  window.addEventListener("resize", layout);
  layout();
  // desktop: scroll di area gelap di samping kolom HP tetap menggulir undangan
  $(".workspace").addEventListener("wheel", (e) => {
    if (phone.contains(e.target) || document.body.classList.contains("locked")) return;
    phone.scrollBy({ top: e.deltaY, left: 0 });
  }, { passive: true });

  // ============ 2. Ganti teks dari config ============
  const banks = W.gift.banks;
  const TEXT = [
    ["14/11/2026", pad(main.getDate()) + "/" + pad(main.getMonth() + 1) + "/" + main.getFullYear()],
    ["The Bride", W.bride.name],
    ["The Groom", W.groom.name],
    ["Putri dari Bapak & Ibu", W.bride.parents],
    ["Putra dari Bapak & Ibu", W.groom.parents],
    ["Oktober", BULAN[main.getMonth()]],
    ["22 oktober 2026", fmtDay(day(W.events[0].date))],
    ["Pukul 12:00-13:00 WIB", W.events[0].time],
    ["KUA Ambarawa", W.events[0].place],
    ["25 Oktober 2026", fmtDay(day(W.events[1].date))],
    ["Pukul 09.00 WIB -selesai", W.events[1].time],
    ["Balai dusun puser pasekan Ambarawa", W.events[1].place],
    ["BANK BCA an. Bride", banks[0] && banks[0].label],
    ["8888998888", banks[0] && banks[0].number],
    ["BANK Mandiri an. Groom", banks[1] && banks[1].label],
    ["88882288222", banks[1] && banks[1].number],
    ["Bride & Groom", couple],
  ];
  const LETTERS = [["Bride", W.bride.nick], ["Groom", W.groom.nick]];
  const marked = {}; // teks asli -> elemen <p> (untuk langkah berikutnya)
  const coverWords = [];
  const fitCoverWords = () => coverWords.forEach(({ p, origW }) => {
    const spans = $$("span", p);
    spans.forEach((s) => { s.style.fontSize = "1em"; });
    const w = spans.reduce((sum, s) => sum + s.offsetWidth, 0);
    const k = w > origW * 1.04 ? (origW * 1.04) / w : 1;
    spans.forEach((s) => { s.style.fontSize = k + "em"; });
  });

  $$(".stage p").forEach((p) => {
    const t = norm(p.textContent);
    const spans = $$("span", p);
    if (!spans.length) return;
    // teks per huruf (judul kuas di cover)
    if (spans.every((s) => s.classList.contains("jfNO9A"))) {
      // lebar asli kata di template (lebar tiap huruf dikunci untuk font aslinya)
      const origW = spans.reduce((sum, s) => sum + (parseFloat(s.style.width) || 0), 0);
      if (origW) coverWords.push({ p, origW });
      // dibuat otomatis agar font pengganti tidak renggang
      spans.forEach((s) => { s.style.width = "auto"; });
      LETTERS.forEach(([from, to]) => {
        if (t.replace(/ /g, "") !== from || from === to) return;
        const tpl = spans[0];
        p.innerHTML = "";
        to.split("").forEach((ch) => {
          const s = tpl.cloneNode(false);
          s.style.width = "auto";
          s.textContent = ch === " " ? " " : ch;
          p.appendChild(s);
        });
      });
      return;
    }
    TEXT.forEach(([from, to]) => {
      if (t !== norm(from)) return;
      marked[from] = p;
      if (!to || from === to) return;
      spans[0].textContent = to;
      spans.slice(1).forEach((s) => s.remove());
    });
  });

  fitCoverWords();
  // ukur ulang setiap kali font selesai dimuat (font baru dimuat saat teksnya pertama kali tampil)
  if (document.fonts) {
    document.fonts.ready.then(fitCoverWords);
    document.fonts.addEventListener("loadingdone", () => {
      fitCoverWords();
      if (opened) fitCoupleNames();
    });
  }

  // ============ 3. Kalender: minggu yang memuat tanggal acara ============
  const monday = new Date(main.getFullYear(), main.getMonth(), main.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  $$("[data-cal]").forEach((el) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + (+el.dataset.cal - 19)); // urutan kolom template: Senin=19 ... Minggu=25
    ($("span", el) || el).textContent = d.getDate();
  });
  const colWidth = () => {
    const a = $('[data-cal="19"]'), b = $('[data-cal="20"]');
    return a && b ? (b.getBoundingClientRect().left - a.getBoundingClientRect().left) / zoomOf() : 0;
  };
  // sorotan hati ada di kolom Sabtu pada template: geser ke hari acara
  function moveHighlight() {
    const shift = ((main.getDay() + 6) % 7) - 5;
    if (!shift) return;
    const marker = $('[data-cal="24"]');
    if (!marker) return;
    const r = marker.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let hl = null;
    $$(".stage .DF_utQ").forEach((el) => {
      if (el.contains(marker) || el.querySelector("p")) return;
      const b = el.getBoundingClientRect();
      if (b.width < 15 || b.width > 90) return;
      if (cx > b.left && cx < b.right && cy > b.top && cy < b.bottom) hl = el;
    });
    if (hl) hl.style.marginLeft = shift * colWidth() + "px";
  }

  // ============ 4. Link Google Maps ============
  $$('.stage a[href*="maps"]').forEach((a, i) => {
    const ev = W.events[i] || W.events[W.events.length - 1];
    if (ev && ev.maps) a.href = ev.maps;
    a.target = "_blank";
    a.rel = "noopener";
  });

  // ============ 5. Foto ============
  const swapPhoto = (file, src) => {
    if (!src) return;
    $$('img[src$="' + file + '"]').forEach((img) => {
      const box = img.parentElement; // .Izwocg (crop transform)
      box.style.width = "100%"; box.style.height = "100%"; box.style.transform = "none";
      img.style.cssText += ";width:100%;height:100%;object-fit:cover";
      img.src = src;
    });
  };
  swapPhoto("437440eb32d2a85f1c7d462179d92128.png", W.photos.cover);
  ["ebf27f722497c2a3d9bddfbfef2a84e9.jpg", "5e58cf630e86bd88360ab5d13a1a8f24.jpg", "c9ffc257bee7f549e3a7798bbc8cd47b.jpg",
    "9abeae4dd1ec6197e7e5e73bc351e9ee.jpg", "d366f0402762a99a6c2cc9a8ec154ffd.jpg", "5b4dddd417f7af8511d70cdc8ab653be.jpg"]
    .forEach((f, i) => {
      // foto galeri bisa diklik untuk membuka lightbox (seperti undangan-jorgi-estetik)
      $$('img[src$="' + f + '"]').forEach((img) => {
        const el = img.closest(".DF_utQ") || img; // kotak foto itu sendiri (galeri dikelompokkan dalam satu grup Canva)
        el.classList.add("gallery-photo");
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "Buka foto " + (i + 1));
        const open = () => hooks.openGallery && hooks.openGallery(i);
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
      swapPhoto(f, W.photos.gallery[i]);
    });

  // ============ 5b. Section 1: Ayat + Save The Date (disusun ulang seperti referensi) ============
  // Isi Canva asli section ini disembunyikan, diganti bingkai scallop marun (SVG), teks ayat, mutiara, bunga,
  // piringan hitam "play the music!", dan pita hijau Save The Date. Ukuran dalam px desain 430.
  const INTRO_H = 850;
  let introEls = [];

  // tinggi section Canva: ubah semua elemen yang tingginya sama dengan section
  function sectionDesignH(section) {
    if (section.dataset.h) return +section.dataset.h;
    const inner = $("._8jGYJw", section);
    const h = inner && parseFloat(inner.style.height);
    return h || section.getBoundingClientRect().height / zoomOf();
  }
  function setSectionHeight(section, newH) {
    const H = sectionDesignH(section);
    section.dataset.h = newH;
    $$('[style*="height"]', section).concat([section]).forEach((el) => {
      const h = parseFloat(el.style.height);
      if (Math.abs(h - H) < 1.5) el.style.height = newH + "px";
    });
    section.style.height = newH + "px";
  }

  // bingkai: superelips dengan tepi bergelombang (scallop), cincin marun di atas, bawah, dan kedua sisi
  function scallopFrameSvg(w, h) {
    const cx = w / 2, cy = h / 2, a = w / 2 - 17, b = h / 2 - 17, n = 2.6, A = 14, m = h > 500 ? 9 : 7, N = 520;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = -b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const r = Math.hypot(x, y) || 1, k = 1 + (A * Math.abs(Math.sin(m * t))) / r;
      pts.push([cx + x * k, cy + y * k]);
    }
    const d = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z";
    // cincin: titik di tepi pada y tertentu, digeser ke dalam
    const edgeAt = (fy, side) => {
      const y = h * fy;
      const cand = pts.filter((p) => (side < 0 ? p[0] < cx : p[0] > cx)).sort((p, q) => Math.abs(p[1] - y) - Math.abs(q[1] - y))[0];
      return [cand[0] - side * 13, cand[1]];
    };
    const rings = [[cx, 17], [cx, h - 17], edgeAt(0.43, -1), edgeAt(0.43, 1), edgeAt(0.6, -1), edgeAt(0.6, 1)];
    return (
      '<svg class="intro-frame__svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
      '<defs><filter id="introMarble" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="3" seed="7"/>' +
      '<feColorMatrix values="0 0 0 0 0.86  0 0 0 0 0.84  0 0 0 0 0.83  0 0 0 0.55 0"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter></defs>' +
      '<path d="' + d + '" fill="#f3efec"/>' +
      '<path d="' + d + '" fill="#f3efec" filter="url(#introMarble)"/>' +
      '<path d="' + d + '" fill="none" stroke="#8b1a2b" stroke-width="5" stroke-linejoin="round"/>' +
      rings.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="6.5" fill="#f3efec" stroke="#8b1a2b" stroke-width="3.6"/>').join("") +
      "</svg>"
    );
  }

  function buildIntroSection() {
    const section = $("#details section");
    if (!section || section.querySelector(".intro")) return;
    const box = $("._mXnjA", section);
    if (!box) return;
    $$(":scope > *", box).forEach((el) => { el.style.display = "none"; });
    setSectionHeight(section, INTRO_H);
    section.classList.add("intro-section");
    // bunga boleh menjuntai melewati batas section (pembungkus Canva memotong dengan overflow: hidden)
    Object.assign(section.parentElement.style, { overflow: "visible", position: "relative", zIndex: "2" });

    const add = (html, parent) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const el = wrap.firstElementChild;
      (parent || box).appendChild(el);
      introEls.push(el);
      return el;
    };
    // Section 1b: Save The Date jadi section sendiri tepat setelah section ayat
    const std = document.createElement("section");
    std.className = "std-section";
    section.after(std);
    const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const band = add('<div class="intro intro-band"><p class="intro-band__title">SAVE <i>THE</i> DATE!</p>' +
      '<p class="intro-band__date">' + HARI[main.getDay()] + ", " + fmtDay(main) + "</p>" +
      '<div class="intro-cd">' +
      ["Days", "Hours", "Minutes", "Seconds"].map((l, i) =>
        (i ? '<span class="intro-cd__sep">:</span>' : "") +
        '<div class="intro-cd__u' + (i === 3 ? " is-sec" : "") + '"><b data-cd="' + i + '">00</b><small>' + l + "</small></div>").join("") +
      "</div>" +
      '<p class="intro-cd__done" hidden>Hari bahagia telah tiba</p>' +
      (hooks.calendarUrl ? '<a class="intro-band__cal" href="' + hooks.calendarUrl + '" target="_blank" rel="noopener noreferrer">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>' +
        "Simpan ke Kalender</a>" : "") +
      "</div>", std);
    // iPhone/iPad/Mac membuka file .ics di aplikasi Kalender; lainnya ke Google Calendar
    const cal = $(".intro-band__cal", band);
    if (cal) cal.addEventListener("click", () => {
      if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) { cal.href = "/kalender.ics"; cal.removeAttribute("target"); }
    });
    add('<img class="intro intro-pearls" src="' + TPL + '6bdbbb03529f3e7d294c0ab232845faa.png" alt="">');
    add('<div class="intro intro-frame">' + scallopFrameSvg(366, 680) +
      '<p class="intro-bismillah" lang="ar">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</p>' +
      '<p class="intro-ayat" lang="ar"><span class="ln">وَمِنْ اٰيٰتِهٖٓ اَنْ خَلَقَ لَكُمْ مِّنْ اَنْفُسِكُمْ اَزْوَاجًا</span><span class="ln">لِّتَسْكُنُوْٓا اِلَيْهَا وَجَعَلَ بَيْنَكُمْ مَّوَدَّةً وَّرَحْمَةً ۗاِنَّ فِيْ</span><span class="ln">ذٰلِكَ لَاٰيٰتٍ لِّقَوْمٍ يَّتَفَكَّرُوْنَ</span></p>' +
      '<p class="intro-arti">Di antara tanda-tanda (kebesaran)-Nya ialah bahwa Dia menciptakan pasangan-pasangan untukmu dari (jenis) dirimu sendiri agar kamu merasa tenteram kepadanya. Dia menjadikan di antaramu rasa cinta dan kasih sayang. Sesungguhnya pada yang demikian itu benar-benar terdapat tanda-tanda (kebesaran Allah) bagi kaum yang berpikir.</p>' +
      '<p class="intro-ref">Q.S. Ar Rum : 21</p></div>');
    add('<img class="intro intro-bouquet" src="' + TPL + 'df6a476e3100a3687f7317b0a7add0d5.png" alt="">');
    add('<img class="intro intro-sparkle" src="' + TPL + 'a0191da0e41966b9c0b27f63a25eb916.png" alt="">');
    const vin = add('<button type="button" class="intro intro-vinyl" aria-label="Putar / jeda musik">' +
      '<img src="' + TPL + '46017cbd6293305e69c70dd0a2e2a225.png" alt="">' +
      '<span class="intro-vinyl__play"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></button>');
    add('<p class="intro intro-playtext">play the music!</p>');
    add('<img class="intro intro-anthurium" src="' + TPL + 'd447a34c0d6c0bbc285b0528ebd8d52f.png" alt="">');
    vin.addEventListener("click", toggleMusic);
    vinyl = $("img", vin);
    tick();
  }

  // ============ 6. Kartu mempelai ============
  // Disusun ulang seperti contoh: kartu renda portrait (aset renda template via border-image), nama + orang tua +
  // Instagram, photo strip miring di kanan bawah, dan bunga anthurium/lili pink. Kartu asli template disembunyikan,
  // kartu acara (marun) di bawahnya digeser turun.
  const coupleBox = (marked["The Bride"] || $("p")).closest("._mXnjA");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // "Putri dari Bapak X & Ibu Y" -> dua baris, dipecah setelah "&"
  const parentsHtml = (s) => esc(s).replace(/ &amp; /, " &amp;<br>");
  const personHtml = (p) =>
    '<h3 class="cc-name"><span>' + esc(p.name) + "</span></h3>" +
    '<p class="cc-parents">' + parentsHtml(p.parents) + "</p>" +
    (p.instagram ? '<a class="cc-ig" href="https://instagram.com/' + encodeURIComponent(p.instagram) + '" target="_blank" rel="noopener">@' + esc(p.instagram) + "</a>" : "");

  // Posisi dalam px desain 430 (relatif terhadap section)
  // kartu mempelai satu layar (850px); kalender mulai setelahnya
  const CC = { card: { l: 30, t: 58, w: 340, h: 704 }, eventTop: 866 };
  const TPL = "/assets/template/";
  let coupleEls = [];

  // ============ 6b. Kartu acara: kalender + Akad/Resepsi + lokasi (dirapikan, rata tengah) ============
  const EV = { bandTop: 850, card: { l: 38, t: 944, w: 354, h: 336 }, sectionH: 1326 };
  function buildEventCard(texture) {
    if (!coupleBox || coupleBox.querySelector(".ev-card")) return;
    const HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const mon = new Date(main.getFullYear(), main.getMonth(), main.getDate());
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const active = (main.getDay() + 6) % 7;
    const week = HARI.map((h, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return '<div class="ev-day' + (i === active ? " is-on" : "") + '"><span>' + h + "</span><b>" + d.getDate() + "</b></div>";
    }).join("");
    const time = (t) => esc(t.replace(/^Pukul\s*/i, "").replace(/\s*-\s*/, " – "));
    const places = W.events.map((e) => e.place).filter((v, i, a) => a.indexOf(v) === i);
    const names = ["Akad", "Resepsi"];
    const ORN = '<p class="ev-orn" aria-hidden="true"><span></span>❦<span></span></p>';
    const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
    const MAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m20.5 3-.16.03L15 5.1 9 3 3.36 4.9a.5.5 0 0 0-.36.48V20.5a.5.5 0 0 0 .5.5l.16-.03L9 18.9l6 2.1 5.64-1.9a.5.5 0 0 0 .36-.48V3.5a.5.5 0 0 0-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>';
    const band = document.createElement("div");
    band.className = "ev-band";
    band.style.top = EV.bandTop + "px";
    band.style.height = EV.sectionH - EV.bandTop + "px";
    coupleBox.appendChild(band);
    const c = EV.card;
    const card = document.createElement("div");
    card.className = "ev-card reveal";
    card.style.cssText = "left:" + c.l + "px;top:" + c.t + "px;width:" + c.w + "px;height:" + c.h + "px;" +
      (texture ? 'background-image:url("' + texture + '")' : "");
    card.innerHTML =
      '<h2 class="ev-month">' + BULAN[main.getMonth()] + "</h2>" +
      '<div class="ev-week">' + week + "</div>" +
      ORN +
      '<div class="ev-times">' + W.events.slice(0, 2).map((e, i) =>
        '<div class="ev-time"><h3>' + names[i] + "</h3><p>" + time(e.time) + "</p></div>").join('<span class="ev-vr"></span>') + "</div>" +
      ORN +
      places.map((pl) => '<p class="ev-place">' + PIN + esc(pl) + "</p>").join("") +
      (W.events[0].maps ? '<a class="ev-map" href="' + esc(W.events[0].maps) + '" target="_blank" rel="noopener">' + MAP + "Petunjuk Lokasi</a>" : "");
    coupleBox.appendChild(card);
    if (typeof io !== "undefined" && io) io.observe(card); else card.classList.add("in");
  }

  function buildCoupleCard() {
    if (!coupleBox || coupleBox.querySelector(".cc-card")) return;
    const z = zoomOf();
    const section = coupleBox.closest("section");
    section.classList.add("couple-section");
    const base = coupleBox.getBoundingClientRect();
    const H = section.getBoundingClientRect().height / z;
    const items = $$(":scope > .DF_utQ", coupleBox).map((el) => {
      const r = el.getBoundingClientRect();
      return { el, t: (r.top - base.top) / z, b: (r.bottom - base.top) / z, h: r.height / z, a: r.width * r.height };
    });
    // bingkai renda asli = elemen terbesar di bagian atas section
    const lace = items.filter((i) => i.t < 120 && i.h < H * 0.8).sort((a, b) => b.a - a.a)[0];
    if (!lace) return;
    const isAnthurium = (i) => !!i.el.querySelector('img[src*="1d3be2d6"]');
    const eventItems = items.filter((i) => i.t >= lace.b - 4 && i.h < H * 0.8 && !isAnthurium(i));
    const oldEventTop = Math.min.apply(null, eventItems.map((i) => i.t));
    const shift = CC.eventTop - oldEventTop;

    // sembunyikan kartu asli + buket anthurium merah
    $$('img[src*="1d3be2d6"]', coupleBox).forEach((im) => { (im.closest("._mXnjA > .DF_utQ") || im).style.display = "none"; });
    // semua elemen template selain kartu acara & latar disembunyikan (termasuk sisa buket yang menyeberang batas)
    items.forEach((i) => {
      if (!eventItems.includes(i) && i.h < H * 0.8) i.el.style.display = "none";
    });
    // kartu acara template diganti kartu baru (buildEventCard); tekstur marunnya dipakai ulang
    const texImg = eventItems.map((i) => i.el.querySelector("img")).filter(Boolean)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const evTexture = texImg ? texImg.getAttribute("src") : "";
    eventItems.forEach((i) => { i.el.style.display = "none"; });
    void shift;
    setSectionHeight(section, EV.sectionH);

    const add = (html) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const el = wrap.firstElementChild;
      coupleBox.appendChild(el);
      coupleEls.push(el);
      return el;
    };
    const c = CC.card;
    add(
      '<div class="cc-card" style="left:' + c.l + "px;top:" + c.t + "px;width:" + c.w + "px;height:" + c.h + 'px">' +
        '<p class="cc-salam" lang="ar">السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللهِ وَبَرَكَاتُهُ</p>' +
        '<p class="cc-intro">Dengan memohon rahmat dan ridho Allah SWT,<br>kami mengundang Bapak/Ibu/Saudara/i<br>untuk hadir di hari bahagia kami.</p>' +
        personHtml(W.bride) +
        '<p class="cc-amp">&amp;</p>' +
        personHtml(W.groom) +
      "</div>"
    );
    if (W.photos.strip && W.photos.strip.length) {
      add('<div class="photo-strip" style="left:262px;top:646px">' +
        W.photos.strip.map((src) => '<div class="photo-strip__img"><img src="' + src + '" alt="" loading="lazy"></div>').join("") +
        "</div>");
    }
    // bunga: buket anthurium pink kanan atas & kiri, lili pink di bawah strip
    add('<img class="cc-flower cc-flower--tr" src="' + TPL + 'd447a34c0d6c0bbc285b0528ebd8d52f.png" alt="">');
    add('<img class="cc-flower cc-flower--l" src="' + TPL + 'd447a34c0d6c0bbc285b0528ebd8d52f.png" alt="">');
    add('<img class="cc-flower cc-lily" src="' + TPL + '021c7d4f4f83e191f99f39b52e279810.png" alt="">');
    buildEventCard(evTexture);
    fitCoupleNames();
    // ukur ulang setelah font script selesai dimuat
    if (document.fonts) document.fonts.ready.then(fitCoupleNames);
    setTimeout(fitCoupleNames, 800);
    setTimeout(fitCoupleNames, 2000);
  }

  // nama panjang dikecilkan sampai muat satu baris di dalam kartu
  function fitCoupleNames() {
    $$(".cc-name").forEach((h) => {
      const span = $("span", h);
      span.style.fontSize = "";
      const box = h.clientWidth, need = span.scrollWidth;
      if (box && need > box * 0.88) span.style.fontSize = ((box * 0.88) / need) + "em";
    });
  }

  // ============ 7. Wedding gift: sembunyikan kartu rekening yang tidak terisi ============
  function hideUnusedBanks() {
    if (banks.length >= 2) return;
    const label = marked["BANK Mandiri an. Groom"], number = marked["88882288222"];
    const slot = $$('[data-widget="copy"]')[1];
    if (!label || !number) return;
    const section = label.closest("section");
    const top = (el) => el.closest("._mXnjA > .DF_utQ") || el;
    const parts = [top(label), top(number)].concat(slot ? [top(slot)] : []);
    const rs = parts.map((el) => el.getBoundingClientRect());
    let y1 = Math.min.apply(null, rs.map((r) => r.top)), y2 = Math.max.apply(null, rs.map((r) => r.bottom));
    // latar kartu = elemen lain yang menutupi rentang yang sama
    $$("._mXnjA > .DF_utQ", section).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top >= y1 - 40 && r.bottom <= y2 + 40 && r.height > 0) { parts.push(el); y1 = Math.min(y1, r.top); y2 = Math.max(y2, r.bottom); }
    });
    parts.forEach((el) => { el.style.display = "none"; });
    // pendekkan section setinggi kartu yang hilang
    const z = zoomOf();
    const H = sectionDesignH(section);
    const delta = Math.min((section.getBoundingClientRect().bottom - y1) / z - 12, H);
    setSectionHeight(section, H - delta);
  }

  // ============ 8. Widget ============
  const audio = $("#bgm"), musicBtn = $("#musicBtn");
  let vinyl = null;
  const setPlaying = (on) => {
    musicBtn.classList.toggle("playing", on);
    if (vinyl) vinyl.classList.toggle("vinyl-spin", on);
  };
  const toggleMusic = () => {
    if (!W.music) { hooks.showToast("Musik belum diatur di config"); return; }
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => {});
    else { audio.pause(); setPlaying(false); }
  };
  if (W.music) { audio.src = W.music; musicBtn.hidden = false; }
  musicBtn.addEventListener("click", toggleMusic);

  $$('[data-widget="music"]').forEach((slot) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "w-music"; b.setAttribute("aria-label", "Putar / jeda musik");
    b.addEventListener("click", toggleMusic);
    slot.innerHTML = "<div></div>";
    slot.firstChild.appendChild(b);
    $$('.stage img[src*="46017cbd"]').forEach((im) => { vinyl = im.closest(".DF_utQ") || im; });
  });

  // hitung mundur
  $$('[data-widget="countdown"]').forEach((slot) => {
    slot.innerHTML = '<div class="w-countdown">' +
      ["Days", "Hours", "Minutes", "Seconds"].map((l, i) =>
        (i ? '<span class="sep">:</span>' : "") + '<div class="u"><b data-cd="' + i + '">00</b><small>' + l + "</small></div>").join("") +
      "</div>";
  });
  const tick = () => {
    const s = Math.max(0, Math.floor((main - new Date()) / 1000));
    const v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    $$("[data-cd]").forEach((el) => { el.textContent = pad(v[+el.dataset.cd]); });
    // setelah hari H: hitung mundur diganti ucapan
    if (s === 0) $$(".intro-cd").forEach((cd) => { cd.hidden = true; const done = cd.parentElement.querySelector(".intro-cd__done"); if (done) done.hidden = false; const c = cd.parentElement.querySelector(".intro-band__cal"); if (c) c.hidden = true; });
  };
  tick(); setInterval(tick, 1000);

  // tombol copy rekening (urutan slot = urutan rekening)
  const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';
  $$('[data-widget="copy"]').forEach((slot, i) => {
    const bank = banks[i];
    if (!bank) return;
    slot.innerHTML = '<div class="w-copy"><button type="button">' + COPY_ICON + "<span>Copy</span></button></div>";
    const btn = $("button", slot), lbl = $("span", btn);
    btn.addEventListener("click", () => {
      const num = bank.number.replace(/\s/g, "");
      const ok = () => {
        btn.classList.add("done"); lbl.textContent = "✓ Disalin";
        hooks.showToast("Nomor rekening disalin");
        setTimeout(() => { btn.classList.remove("done"); lbl.textContent = "Copy"; }, 1800);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(num).then(ok, () => hooks.showToast(num));
      else hooks.showToast(num);
    });
  });

  // RSVP: isi slot dirender oleh React (ucapan, kehadiran, QR check-in)
  // RSVP dirender React ke wadah sendiri; wadah dipindah ke kartu RSVP baru saat undangan dibuka (buildRsvpSection)
  const rsvpHost = document.createElement("div");
  rsvpHost.className = "w-rsvp-root";
  hooks.mountRsvp(rsvpHost);

  // Slot embed ada di dalam wrapper Canva yang diskalakan (transform: scale s).
  // Ukuran yang tersimpan di slot = ukuran VISUAL iframe asli (px desain 430):
  // ukuran CSS slot = visual / s, isi widget dibuat di ukuran visual lalu di-scale 1/s.
  function fitWidgets() {
    const z = zoomOf();
    $$(".embed-slot").forEach((slot) => {
      const w = slot.firstElementChild;
      if (!w) return;
      if (!slot.dataset.vw) { slot.dataset.vw = slot.offsetWidth; slot.dataset.vh = slot.offsetHeight; }
      const vw = +slot.dataset.vw, vh = +slot.dataset.vh;
      slot.style.width = vw + "px"; slot.style.height = vh + "px";
      const s = slot.getBoundingClientRect().width / z / vw;
      if (!s || !isFinite(s)) return;
      slot.style.width = vw / s + "px"; slot.style.height = vh / s + "px";
      Object.assign(w.style, { position: "absolute", left: "0", top: "0", width: vw + "px", height: vh + "px", transform: "scale(" + 1 / s + ")", transformOrigin: "0 0" });
    });
  }
  window.addEventListener("resize", fitWidgets);

  // ============ 9. Panel desktop ============
  const guest = new URLSearchParams(location.search).get("to") || "";
  $$(".side [data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (k === "bride.nick") el.textContent = W.bride.nick;
    else if (k === "groom.nick") el.textContent = W.groom.nick;
    else if (k === "dateShort") el.textContent = pad(main.getDate()) + "/" + pad(main.getMonth() + 1) + "/" + main.getFullYear();
  });
  if (guest) { const sg = $("#sideGuest"); sg.hidden = false; $("b", sg).textContent = guest; }

  // ============ 10. Animasi muncul per elemen ============
  const revealEls = $$("#details section ._mXnjA > .DF_utQ");
  revealEls.forEach((el) => el.classList.add("reveal"));
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.1 })
    : null;

  // ============ 11. Buka undangan: cover terbelah & terbuka seperti pintu ============
  // Section 1 disiapkan di belakang cover lebih dulu (tidak ada layar kosong), lalu dua daun pintu
  // (salinan cover yang dipotong kiri/kanan) berputar membuka. Elemen Section 1 masuk berurutan (CSS .intro-enter).
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DOOR_MS = 1100;

  function makeDoors() {
    const r = cover.getBoundingClientRect();
    const doors = document.createElement("div");
    doors.className = "doors";
    Object.assign(doors.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    ["left", "right"].forEach((side) => {
      const door = document.createElement("div");
      door.className = "door door--" + side;
      const face = cover.cloneNode(true);
      face.removeAttribute("id");
      face.classList.remove("is-leaving");
      face.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      face.style.height = r.height + "px";
      door.appendChild(face);
      doors.appendChild(door);
    });
    document.body.appendChild(doors);
    return doors;
  }

  function showDetails() {
    cover.hidden = true; // cover disembunyikan
    details.hidden = false;
    document.body.classList.remove("locked");
    phone.scrollTop = 0;
    window.scrollTo(0, 0);
    layout();
    moveHighlight();
    buildIntroSection();
    buildCoupleCard();
    addGiftSparkles();
    buildRsvpSection();
    buildClosingSection();
    hideUnusedBanks();
    fitWidgets();
    if (io) revealEls.forEach((el) => io.observe(el));
    else revealEls.forEach((el) => el.classList.add("in"));
    // elemen layar pertama (ayat) punya animasi masuk sendiri; sisanya muncul saat discroll
    const introSection = $(".intro-section");
    const firstScreen = introEls.filter((el) => introSection && introSection.contains(el));
    firstScreen.forEach((el) => el.classList.remove("reveal"));
    introEls.filter((el) => !firstScreen.includes(el))
      .forEach((el) => { el.classList.add("reveal"); if (io) io.observe(el); else el.classList.add("in"); });
    rsvpEls.concat(closeEls).forEach((el) => { el.classList.add("reveal"); if (io) io.observe(el); else el.classList.add("in"); });
    // Section 2: animasi masuk berurutan saat kartu mempelai terlihat
    const coupleSec = $(".couple-section");
    if (coupleSec) {
      if ("IntersectionObserver" in window) {
        const co = new IntersectionObserver((es) => es.forEach((e) => {
          if (e.isIntersecting) { coupleSec.classList.add("cc-enter"); co.disconnect(); }
        }), { threshold: 0.25 });
        co.observe(coupleSec);
      } else coupleSec.classList.add("cc-enter");
    }
    swayFlowers();
    return introSection;
  }

  // kelopak sakura putih: jumlah per section (section padat teks lebih sedikit)
  const sakura = createSakura(phone, (sec) => {
    if (sec.querySelector('[data-widget="rsvp"]')) return 5;
    if (sec.classList.contains("couple-section")) return 5;
    if (sec.querySelector('[data-widget="copy"]')) return 6;
    if (sec.classList.contains("intro-section")) return 7;
    const all = $$("#details section");
    if (sec === all[all.length - 1]) return 12;
    return 9;
  });

  // Semua bunga bergoyang pelan terus-menerus (tempo berbeda) dan ikut miring terbawa angin scroll (--fwind).
  // Bunga menggantung berporos di atas, bunga berdiri (lili, calla, buket lantai) berporos di bawah.
  const HANGING = ["d447a34c", "df6a476e", "db0864fe", "1d3be2d6"];
  const STANDING = ["021c7d4f", "e3bde292", "cd433c50", "69693328", "ae62a4e0"];
  function swayFlowers() {
    let n = 0;
    const mark = (el, hanging) => {
      if (!el || el.classList.contains("flower-sway")) return;
      el.classList.add("flower-sway");
      // poros atas/bawah hanya untuk elemen yang tidak diputar (agar posisinya tidak bergeser)
      if (!el.classList.contains("flower-keep-origin")) el.classList.add(hanging ? "flower-hang" : "flower-stand");
      else el.style.setProperty("--fk", hanging ? "1" : "-0.6");
      el.style.setProperty("--fdur", (4.2 + (n * 0.73) % 2.4).toFixed(2) + "s");
      el.style.setProperty("--fdly", (-(n * 1.37) % 4).toFixed(2) + "s");
      n++;
    };
    // elemen template Canva: poros hanya diubah bila elemen tidak diputar (agar posisinya tidak bergeser)
    HANGING.concat(STANDING).forEach((key) => {
      $$('#details img[src*="' + key + '"]').forEach((img) => {
        const el = img.closest(".DF_utQ");
        if (!el || el.closest(".intro, .cc-flower") || getComputedStyle(el).display === "none") return;
        const m = new DOMMatrix(getComputedStyle(el).transform);
        if (Math.abs(m.b) > 0.01 || m.a < 0) el.classList.add("flower-keep-origin");
        mark(el, HANGING.includes(key));
      });
    });
    $$(".intro-bouquet, .intro-anthurium, .cc-flower--tr, .cc-flower--l").forEach((el) => mark(el, true));
    $$(".cc-lily, .rsvp-lily, .cl-calla, .cl-bouquet").forEach((el) => mark(el, false));
  }

  // Kilau berkedip di sekitar kotak hadiah Wedding Gift (animasi Lottie yang sama dengan undangan-jorgi-estetik)
  function addGiftSparkles() {
    const gift = $('#details img[src*="blob-1206374b"]');
    const box = gift && gift.closest("._mXnjA");
    const el = gift && gift.closest(".DF_utQ");
    if (!box || !el || box.querySelector(".gift-sparkle")) return;
    const z = zoomOf(), b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    const gx = (r.left - b.left) / z, gy = (r.top - b.top) / z, gw = r.width / z, gh = r.height / z;
    const spots = [[gx + gw * 0.74, gy - gh * 0.12, 38], [gx - gw * 0.06, gy + gh * 0.5, 28]];
    const holders = spots.map(([l, t, w]) => {
      const d = document.createElement("div");
      d.className = "gift-sparkle";
      d.setAttribute("aria-hidden", "true");
      d.style.cssText = "left:" + l.toFixed(1) + "px;top:" + t.toFixed(1) + "px;width:" + w + "px;height:" + (w * 1.408).toFixed(1) + "px";
      box.appendChild(d);
      return d;
    });
    if (reduceMotion) return;
    import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      holders.forEach((container, i) => {
        const anim = lottie.loadAnimation({ container, renderer: "svg", loop: true, autoplay: false, path: "/assets/lottie/sparkle.json" });
        // gugus kedua mulai sedikit terlambat supaya berkedip bergantian
        setTimeout(() => anim.play(), i * 700);
      });
    });
  }

  // ============ Section RSVP: judul + kartu renda tipis hampir selebar layar ============
  const RSVP = { h: 760, card: { l: 26, t: 132, w: 378, h: 596 } };
  let rsvpEls = [];
  function buildRsvpSection() {
    const slot = $('[data-widget="rsvp"]');
    const section = slot && slot.closest("section");
    const box = section && $("._mXnjA", section);
    if (!box || box.querySelector(".rsvp-card2")) return;
    $$(":scope > .DF_utQ", box).forEach((el) => { el.style.display = "none"; });
    setSectionHeight(section, RSVP.h);
    section.classList.add("rsvp-section");
    const add = (html) => {
      const w = document.createElement("div");
      w.innerHTML = html;
      const el = w.firstElementChild;
      box.appendChild(el);
      rsvpEls.push(el);
      return el;
    };
    add('<h2 class="rsvp-title">Konfirmasi Kehadiran</h2>');
    add('<p class="rsvp-sub">Kehadiran dan doa restu Anda merupakan kebahagiaan bagi kami</p>');
    const c = RSVP.card;
    const card = add('<div class="rsvp-card2" style="left:' + c.l + "px;top:" + c.t + "px;width:" + c.w + "px;height:" + c.h + 'px"></div>');
    card.appendChild(rsvpHost);
    add('<img class="cc-flower rsvp-lily" src="' + TPL + '021c7d4f4f83e191f99f39b52e279810.png" alt="">');
  }

  // ============ Section penutup: polaroid + "Kami Akan Menikah!" + kertas perangko ============
  const CLOSE_H = 900;
  let closeEls = [];
  function buildClosingSection() {
    const all = $$("#details section");
    const section = all[all.length - 1];
    const box = section && $("._mXnjA", section);
    if (!box || box.querySelector(".cl-stamp")) return;
    $$(":scope > *", box).forEach((el) => { el.style.display = "none"; }); // termasuk latar satin template
    setSectionHeight(section, CLOSE_H);
    section.classList.add("close-section");
    const add = (html) => {
      const w = document.createElement("div");
      w.innerHTML = html;
      const el = w.firstElementChild;
      box.appendChild(el);
      closeEls.push(el);
      return el;
    };
    const family = (parents) => "Keluarga " + esc(parents.replace(/^Putr[ai] dari\s*/i, ""));
    add('<div class="cl-band"></div>');
    const photo = W.photos.gallery[0];
    if (photo) {
      const pol = add('<button type="button" class="cl-polaroid" aria-label="Buka foto">' +
        '<span class="cl-pol__tape" aria-hidden="true"></span>' +
        '<span class="cl-pol__photo"><img src="' + photo + '" alt="Foto ' + esc(W.bride.nick) + " dan " + esc(W.groom.nick) + '"></span>' +
        "</button>");
      pol.addEventListener("click", () => hooks.openGallery && hooks.openGallery(0));
    }
    add('<img class="cl-calla" src="' + TPL + 'cd433c5065e3b51a535f1d5f60d89b09.png" alt="">');
    add('<img class="cl-butterfly" src="' + TPL + '6a2fd4d294fde9674f91d38da6748ad2.gif" alt="">');
    add('<h2 class="cl-title">Kami<br>Akan<br>Menikah!</h2>');
    add('<p class="cl-text">Dengan izin Allah, kami memulai lembaran baru. Terima kasih telah menjadi bagian dari perjalanan kami.</p>');
    add('<div class="cl-stamp">' +
      '<p>Suatu kehormatan dan kebahagiaan bagi kami sekeluarga apabila Bapak/Ibu/Saudara/i berkenan hadir untuk memberikan doa dan restu kepada kedua mempelai.</p>' +
      '<p>Atas kehadiran serta doa restunya, kami ucapkan terima kasih.</p>' +
      '<p class="cl-salam">Wassalamu\'alaikum Warahmatullahi Wabarakatuh</p>' +
      '<p class="cl-happy">Kami yang berbahagia</p>' +
      '<p class="cl-names">' + esc(W.bride.nick) + " &amp; " + esc(W.groom.nick) + "</p>" +
      '<p class="cl-family">' + family(W.bride.parents) + "<br>" + family(W.groom.parents) + "</p>" +
      "</div>");
    add('<img class="cl-seal" src="' + TPL + 'd73e76347fb6c5fa5e5d18905dfda4b4.png" alt="">');
    add('<img class="cl-bouquet" src="' + TPL + '696933280fff5a395be069f8a6eb7697.png" alt="">');
  }

  let opened = false;
  const open = (instant) => {
    if (opened) return;
    opened = true;
    if (W.music) audio.play().then(() => setPlaying(true)).catch(() => {});
    if (instant || reduceMotion) {
      showDetails();
      sakura.start(false);
      return;
    }
    const doors = makeDoors();
    const seam = doors.getBoundingClientRect();
    const introSection = showDetails();
    if (introSection) introSection.classList.add("intro-enter");
    // dua frame agar posisi awal pintu tergambar sebelum transisi dimulai
    requestAnimationFrame(() => requestAnimationFrame(() => doors.classList.add("is-open")));
    // kelopak terlempar dari celah pintu, lalu hujan kelopak mulai dari atas
    setTimeout(() => { sakura.burst(seam.left + seam.width / 2, seam.top + seam.height * 0.55); sakura.start(true); }, 120);
    setTimeout(() => doors.remove(), DOOR_MS + 150);
  };
  $$('#cover a[href^="#page"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); open(); }));
  // /details langsung membuka isi undangan (tanpa animasi pintu)
  if (location.pathname.replace(/\/+$/, "") === "/details") open(true);
}
