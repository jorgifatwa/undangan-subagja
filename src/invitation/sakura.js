// Kelopak sakura putih berjatuhan, sama seperti Sakura.tsx di undangan-jorgi-estetik:
// ledakan kelopak saat undangan dibuka, hujan kelopak terus-menerus, angin saat discroll,
// dan jumlah kelopak menyesuaikan section yang sedang tampil (section padat teks lebih sedikit).

const COLORS = ["#ffffff", "#fbf8f2", "#f3efe7", "#fffdf8"];
const VEIN = "#d9d2c4";

const RAIN = [
  { left: 6, size: 12, duration: 11, sway: 18, depth: 0.7 },
  { left: 82, size: 14, duration: 13, sway: -22, depth: 1.2 },
  { left: 38, size: 10, duration: 12, sway: 16, depth: 0.6 },
  { left: 64, size: 13, duration: 14.5, sway: -18, depth: 1 },
  { left: 18, size: 15, duration: 12.5, sway: 24, depth: 1.4 },
  { left: 92, size: 11, duration: 10.5, sway: -14, depth: 0.8 },
  { left: 50, size: 12, duration: 15, sway: 20, depth: 1.1 },
  { left: 28, size: 11, duration: 13.5, sway: -20, depth: 0.9 },
  { left: 72, size: 14, duration: 11.5, sway: 22, depth: 1.3 },
  { left: 12, size: 10, duration: 14, sway: -16, depth: 0.7 },
  { left: 56, size: 13, duration: 12, sway: 18, depth: 1.2 },
  { left: 88, size: 12, duration: 13, sway: -24, depth: 1 },
];
const BURST_COUNT = 22;
const WIND_PER_PX = 5;
const WIND_MAX = 140;
const WIND_EASE = 0.1;

const seeded = (i, salt) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const petalSvg = (color) =>
  '<svg viewBox="0 0 20 24" width="100%" height="100%" aria-hidden="true" class="sakura-tumble">' +
  '<path d="M10 24C4.6 20.4 0.4 14 1.6 7.2C2.3 3.4 4.8 0.6 7.6 1.6L10 4.4L12.4 1.6C15.2 0.6 17.7 3.4 18.4 7.2C19.6 14 15.4 20.4 10 24Z" fill="' + color + '"/>' +
  '<path d="M10 8.5C9.6 13 9.8 17.5 10 21" stroke="' + VEIN + '" stroke-width="0.7" fill="none" opacity="0.7"/></svg>';

/**
 * @param {HTMLElement} phone kolom HP (area kelopak)
 * @param {(section: Element) => number} densityOf jumlah kelopak untuk section yang tampil
 */
export function createSakura(phone, densityOf) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return { start() {}, burst() {} };

  const layer = document.createElement("div");
  layer.className = "sakura-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.density = "12";
  document.body.appendChild(layer);

  // lapisan menempel di layar, selebar kolom HP
  const place = () => {
    const r = phone.getBoundingClientRect();
    Object.assign(layer.style, { left: r.left + "px", width: r.width + "px", top: "0px", height: window.innerHeight + "px" });
  };
  place();
  window.addEventListener("resize", place);

  let raining = false;
  function start(enterFromTop) {
    if (raining) return;
    raining = true;
    const group = document.createElement("div");
    group.className = "sakura-rain-group";
    group.innerHTML = RAIN.map((p, i) => {
      const delay = enterFromTop ? (i * 0.7 + seeded(i, 1) * 0.5).toFixed(2) : (-seeded(i, 2) * p.duration).toFixed(2);
      return '<div class="sakura-rain" style="left:' + p.left + "%;width:" + p.size + "px;height:" + p.size * 1.2 + "px;--depth:" + p.depth +
        ";--sway:" + p.sway + "px;--duration:" + p.duration + "s;--delay:" + delay + 's"><div class="sakura-fall">' +
        petalSvg(COLORS[i % COLORS.length]) + "</div></div>";
    }).join("");
    layer.appendChild(group);
    density();
  }

  // kelopak terlempar dari satu titik di layar (px viewport), mis. celah pintu saat dibuka
  function burst(x, y) {
    const box = layer.getBoundingClientRect();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = -90 + (seeded(i, 3) - 0.5) * 150;
      const speed = 90 + seeded(i, 4) * 150;
      const size = 9 + seeded(i, 5) * 7;
      const el = document.createElement("div");
      el.className = "sakura-burst";
      el.style.cssText =
        "left:" + (x - box.left - size / 2) + "px;top:" + (y - box.top - size / 2) + "px;width:" + size + "px;height:" + size * 1.2 + "px;" +
        "--bx:" + (Math.cos((angle * Math.PI) / 180) * speed).toFixed(1) + "px;--by:" + (Math.sin((angle * Math.PI) / 180) * speed).toFixed(1) + "px;" +
        "--drop:" + (260 + seeded(i, 6) * 260).toFixed(0) + "px;--spin:" + ((seeded(i, 7) - 0.5) * 720).toFixed(0) + "deg;" +
        "--duration:" + (2.4 + seeded(i, 8) * 1.4).toFixed(2) + "s;--delay:" + (seeded(i, 9) * 0.25).toFixed(2) + "s";
      el.innerHTML = petalSvg(COLORS[i % COLORS.length]);
      frag.appendChild(el);
    }
    const wrap = document.createElement("div");
    wrap.appendChild(frag);
    layer.appendChild(wrap);
    setTimeout(() => wrap.remove(), 4500);
  }

  // jumlah kelopak menurut section di tengah layar
  function density() {
    const r = layer.getBoundingClientRect();
    layer.style.visibility = "hidden"; // supaya elementFromPoint mengenai halaman, bukan lapisan
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    layer.style.visibility = "";
    const section = el && el.closest("section");
    layer.dataset.density = String(section ? densityOf(section) : 12);
  }

  // angin dari scroll
  let last = null, target = 0, wind = 0, frame = 0;
  const tick = () => {
    wind += (target - wind) * WIND_EASE;
    target *= 0.85;
    layer.style.setProperty("--wind", wind.toFixed(2));
    document.documentElement.style.setProperty("--fwind", (wind * 0.05).toFixed(2) + "deg");
    frame = Math.abs(wind) > 0.2 || Math.abs(target) > 0.2 ? requestAnimationFrame(tick) : 0;
    if (!frame) { layer.style.setProperty("--wind", "0"); document.documentElement.style.setProperty("--fwind", "0deg"); }
  };
  document.addEventListener("scroll", () => {
    if (!raining) return;
    const top = phone.scrollHeight > phone.clientHeight + 1 ? phone.scrollTop : window.scrollY;
    if (last !== null) {
      target = Math.max(-WIND_MAX, Math.min(WIND_MAX, target + (top - last) * WIND_PER_PX * 0.2));
      if (!frame) frame = requestAnimationFrame(tick);
    }
    last = top;
    density();
  }, { capture: true, passive: true });

  return { start, burst };
}
