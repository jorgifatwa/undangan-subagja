// Runtime undangan: mengisi data dari config ke markup template, skala layar, widget, dan buka undangan.
// Dipanggil sekali dari InvitationRuntime (komponen React) setelah markup ada di halaman.

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
 * @param {{ mountRsvp: (el: HTMLElement) => void, showToast: (msg: string) => void }} hooks
 */
export function initInvitation(W, hooks) {
  const phone = $("#phone"), cover = $("#cover"), details = $("#details");
  document.body.classList.add("locked"); // cover terkunci sampai "Buka Undangan"
  const main = new Date(W.date);
  const couple = W.bride.nick + " & " + W.groom.nick;
  const zoomOf = () => parseFloat(details.firstElementChild.style.zoom) || 1;

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
      if (opened) fitNames();
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
    .forEach((f, i) => swapPhoto(f, W.photos.gallery[i]));

  // ============ 6. Kartu mempelai: Instagram + photo strip ============
  const coupleBox = (marked["The Bride"] || $("p")).closest("._mXnjA");
  // handle Instagram: baris baru di teks orang tua (ikut skala teks Canva)
  const addHandle = (p, handle) => {
    if (!p || !handle) return;
    const tpl = $("span", p);
    const a = document.createElement("a");
    a.className = "ig-handle " + tpl.className;
    a.style.cssText = tpl.style.cssText;
    a.href = "https://instagram.com/" + handle;
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = "@" + handle;
    p.appendChild(a);
  };
  addHandle(marked["Putri dari Bapak & Ibu"], W.bride.instagram);
  addHandle(marked["Putra dari Bapak & Ibu"], W.groom.instagram);

  let strip = null;
  if (coupleBox && W.photos.strip && W.photos.strip.length) {
    strip = document.createElement("div");
    strip.className = "photo-strip";
    strip.innerHTML = W.photos.strip.map((src) => '<div class="photo-strip__img"><img src="' + src + '" alt="" loading="lazy"></div>').join("");
  }

  // Kartu renda diperkecil & digeser ke kiri supaya photo strip muat di kanan (seperti contoh)
  const CARD_SCALE = 0.8, CARD_LEFT = 14;
  function arrangeCoupleCard() {
    if (!coupleBox || !strip || coupleBox.querySelector(".couple-card")) return;
    const z = zoomOf();
    const base = coupleBox.getBoundingClientRect();
    const local = (el) => { const r = el.getBoundingClientRect(); return { l: (r.left - base.left) / z, t: (r.top - base.top) / z, r: (r.right - base.left) / z, b: (r.bottom - base.top) / z, a: r.width * r.height }; };
    const items = $$(":scope > .DF_utQ", coupleBox).map((el) => ({ el, box: local(el) }));
    const card = marked["The Bride"].closest("._mXnjA > .DF_utQ");
    // bingkai renda = elemen terbesar di bagian atas section
    const lace = items.filter((i) => i.box.t < 120).sort((a, b) => b.box.a - a.box.a)[0];
    if (!lace || !card) return;
    const L = lace.box;
    const group = document.createElement("div");
    group.className = "couple-card";
    items.forEach(({ el, box }) => {
      if (box.t >= L.t - 4 && box.b <= L.b + 4 && box.a > 0) group.appendChild(el);
    });
    // kartu yang lebih kecil diletakkan di tengah tinggi aslinya
    const dy = ((L.b - L.t) * (1 - CARD_SCALE)) / 2;
    group.style.transformOrigin = L.l + "px " + L.t + "px";
    group.style.transform = "translate(" + (CARD_LEFT - L.l) + "px, " + dy + "px) scale(" + CARD_SCALE + ")";
    coupleBox.insertBefore(group, coupleBox.firstChild.nextSibling);
    // strip di kanan kartu, menempel sedikit di tepi renda dan menjuntai ke bawah
    const cardRight = CARD_LEFT + (L.r - L.l) * CARD_SCALE;
    const cardBottom = L.t + dy + (L.b - L.t) * CARD_SCALE;
    strip.style.left = cardRight - 22 + "px";
    strip.style.top = cardBottom - 205 + "px";
    coupleBox.appendChild(strip);
  }

  // nama panjang dikecilkan sampai muat satu baris; teks orang tua dipecah sebelum "&" bila terlalu lebar
  function fitNames() {
    const intro = $$(".stage p").find((p) => /Dengan memohon rahmat/.test(p.textContent));
    const maxW = intro ? intro.getBoundingClientRect().width * 1.02 : 0;
    ["The Bride", "The Groom"].forEach((k) => {
      const p = marked[k];
      if (!p) return;
      const span = $("span", p);
      span.style.fontSize = "1em";
      p.style.whiteSpace = "nowrap";
      const box = Math.max(p.parentElement.getBoundingClientRect().width, maxW * 0.9);
      const need = span.getBoundingClientRect().width;
      if (need > box && box > 0) span.style.fontSize = (box / need) * 0.97 + "em";
    });
    ["Putri dari Bapak & Ibu", "Putra dari Bapak & Ibu"].forEach((k) => {
      const p = marked[k];
      if (!p || !maxW) return;
      const span = $("span:not(.ig-handle)", p);
      if (!span || span.dataset.split) return;
      if (span.getBoundingClientRect().width > maxW && / & /.test(span.textContent)) {
        span.dataset.split = "1";
        const [a, b] = span.textContent.split(/ (?=& )/);
        span.textContent = a;
        span.appendChild(document.createElement("br"));
        span.appendChild(document.createTextNode(b));
      }
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
    const H = section.getBoundingClientRect().height / z;
    const delta = Math.min((section.getBoundingClientRect().bottom - y1) / z - 12, H);
    $$('[style*="height"]', section).concat([section]).forEach((el) => {
      const h = parseFloat(el.style.height);
      if (Math.abs(h - H) < 1.5) el.style.height = H - delta + "px";
    });
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
  const cds = $$("[data-cd]");
  const tick = () => {
    const s = Math.max(0, Math.floor((main - new Date()) / 1000));
    const v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    cds.forEach((el) => { el.textContent = pad(v[+el.dataset.cd]); });
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
  $$('[data-widget="rsvp"]').forEach((slot) => {
    slot.innerHTML = '<div class="w-rsvp-root"></div>';
    hooks.mountRsvp(slot.firstChild);
  });

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

  // ============ 11. Buka undangan ============
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    if (W.music) audio.play().then(() => setPlaying(true)).catch(() => {});
    cover.classList.add("is-leaving");
    setTimeout(() => {
      cover.hidden = true; // cover disembunyikan
      details.hidden = false;
      document.body.classList.remove("locked");
      phone.scrollTop = 0;
      window.scrollTo(0, 0);
      layout();
      moveHighlight();
      fitNames();
      arrangeCoupleCard();
      hideUnusedBanks();
      fitWidgets();
      if (io) revealEls.forEach((el) => io.observe(el));
      else revealEls.forEach((el) => el.classList.add("in"));
      if (strip && strip.isConnected) { strip.classList.add("reveal"); if (io) io.observe(strip); else strip.classList.add("in"); }
    }, 700);
  };
  $$('#cover a[href^="#page"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); open(); }));
  // /details langsung membuka isi undangan
  if (location.pathname.replace(/\/+$/, "") === "/details") open();
}
