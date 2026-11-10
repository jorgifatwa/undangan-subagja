"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./Toast";
import { CheckinPassDialog } from "./CheckinPass";
import { ATTENDANCE_OPTIONS, MESSAGE_MAX, NAME_MAX, attendanceLabel, validateWish, type Attendance } from "@/lib/wishValidation";
import { googleCalendarUrl } from "@/lib/weddingEvent";

// RSVP & ucapan di kartu renda (menggantikan widget RSVP template). Logikanya sama dengan WishesSection di
// undangan-jorgi-estetik: link personal ?g=<id> mengunci nama, ucapan tersimpan lewat /api/wishes, dan tamu yang
// memilih "Hadir" langsung mendapat QR check-in.

interface Wish {
  id: string;
  name: string;
  message: string;
  attendance?: Attendance;
  createdAt: string;
}

const REFRESH_MS = 30_000;
const MIN_LOADING_MS = 700;

const relativeTime = (iso: string) => {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "baru saja";
};

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
  </svg>
);
const CrossIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
  </svg>
);
const LockIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, opacity: 0.7 }}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const RsvpWidget: React.FC<{ title: string; dateText: string }> = ({ title, dateText }) => {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [nameLocked, setNameLocked] = useState(false);
  const [attendance, setAttendance] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [newWishId, setNewWishId] = useState<string | null>(null);
  // QR check-in: dibuka dari tombol, atau otomatis setelah tamu mengirim "Hadir"
  const [pass, setPass] = useState<{ intro?: string; name?: string } | null>(null);
  const { showToast } = useToast();
  const listRef = useRef<HTMLDivElement | null>(null);

  const loadWishes = useCallback(async () => {
    try {
      const res = await fetch("/api/wishes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { wishes: Wish[] };
      setWishes(data.wishes);
    } catch {
      // tetap tampilkan yang ada; refresh berikutnya mencoba lagi
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(loadWishes, 0);
    const timer = setInterval(loadWishes, REFRESH_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [loadWishes]);

  // Link personal: ?g=<id> (nama dikunci bila tamu punya nomor WhatsApp), ?to=Nama hanya mengisi awal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("g")?.trim();
    const to = params.get("to")?.trim();
    let cancelled = false;
    const prefill = setTimeout(async () => {
      const prefillTo = () => {
        if (to && !cancelled) setName((current) => current || to.slice(0, NAME_MAX));
      };
      if (!id) return prefillTo();
      try {
        const res = await fetch(`/api/wishes/guest?g=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return prefillTo();
        const data = (await res.json()) as { name: string; locked: boolean; group?: boolean };
        setGuestId(id);
        if (data.group) return;
        if (data.locked) {
          setName(data.name);
          setNameLocked(true);
        } else {
          setName((current) => current || data.name.slice(0, NAME_MAX));
        }
      } catch {
        prefillTo();
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(prefill);
    };
  }, []);

  const openForm = (value: Attendance) => {
    setAttendance(value);
    setError(null);
    setFormOpen(true);
  };

  const fail = (problem: string) => {
    setError(problem);
    showToast(problem, "error");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const problem = validateWish({ name, message, attendance, nameFromGuestList: nameLocked });
    if (problem) return fail(problem);

    setSubmitting(true);
    setError(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, attendance, website, ...(guestId ? { guestId } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { wish?: Wish; error?: string };
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_LOADING_MS - (Date.now() - started))));
      if (!res.ok || !data.wish) return fail(data.error ?? "Ucapan gagal dikirim, silakan coba lagi.");
      const wish = data.wish;
      setWishes((prev) => [wish, ...prev.filter((w) => w.id !== wish.id)]);
      setNewWishId(wish.id);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setMessage("");
      setFormOpen(false);
      if (attendance === "hadir") setPass({ intro: "Terima kasih, ucapan Anda sudah terkirim! Kami menantikan kehadiran Anda.", name: name.trim() });
      else showToast("Terima kasih, ucapan Anda sudah terkirim!");
      setAttendance("");
    } catch {
      fail("Koneksi bermasalah, ucapan belum terkirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // iPhone/iPad/Mac membuka .ics di aplikasi Kalender; lainnya ke Google Calendar
  const openCalendar = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return;
    event.currentTarget.href = "/kalender.ics";
    event.currentTarget.removeAttribute("target");
  };

  const presentCount = wishes.filter((w) => w.attendance === "hadir").length;
  const absentCount = wishes.filter((w) => w.attendance === "tidak_hadir").length;

  return (
    <div className="w-rsvp">
      <h3>{title}</h3>
      <p className="date">{dateText}</p>
      <p className="ornament" aria-hidden="true">
        <span />❦<span />
      </p>
      <p className="ask">Mohon konfirmasi kehadiran Anda</p>
      <div className="choice">
        <button type="button" onClick={() => openForm("hadir")}>
          <CheckIcon />
          Hadir
        </button>
        <button type="button" onClick={() => openForm("tidak_hadir")}>
          <CrossIcon />
          Tidak Hadir
        </button>
      </div>
      <div className="extra">
        <button type="button" onClick={() => setPass({})}>
          QR Check-in
        </button>
        <span aria-hidden="true">·</span>
        <a href={googleCalendarUrl()} target="_blank" rel="noopener noreferrer" onClick={openCalendar}>
          Simpan ke Kalender
        </a>
      </div>
      <p className="wall-title">
        <span className="rule" />
        Dinding Tamu
        <span className="rule" />
      </p>
      <p className="wall-count">
        {wishes.length} Ucapan · {presentCount} Hadir · {absentCount} Tidak Hadir
      </p>
      <div className="wall" ref={listRef}>
        {loaded && wishes.length === 0 && <p className="empty">Belum ada ucapan. Jadilah yang pertama!</p>}
        {wishes.map((wish) => (
          <article key={wish.id} className={`msg${wish.id === newWishId ? " wish-new" : ""}`}>
            <b>
              {wish.name}
              {wish.attendance && <em className={wish.attendance === "hadir" ? "on" : ""}>{attendanceLabel(wish.attendance)}</em>}
            </b>
            <span className="text">{wish.message}</span>
            <time>{relativeTime(wish.createdAt)}</time>
          </article>
        ))}
      </div>

      {formOpen &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Ucapan & Doa" className="checkin-pass-backdrop" onClick={() => !submitting && setFormOpen(false)}>
            <div className="checkin-pass-card rsvp-card" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Tutup" className="checkin-pass-close">
                ✕
              </button>
              <p className="rsvp-card__title">Ucapan &amp; Doa</p>
              <p className="checkin-pass-note">Kirimkan ucapan dan doa terbaik untuk kedua mempelai</p>
              <form onSubmit={handleSubmit} noValidate className="rsvp-form">
                {nameLocked ? (
                  <div aria-label="Nama" className="rsvp-field rsvp-field--locked">
                    <LockIcon />
                    <span>{name}</span>
                  </div>
                ) : (
                  <input
                    className="rsvp-field wish-field"
                    type="text"
                    value={name}
                    maxLength={NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Anda"
                    aria-label="Nama"
                    autoComplete="name"
                  />
                )}
                <select className="rsvp-field wish-field" value={attendance} onChange={(e) => setAttendance(e.target.value)} aria-label="Konfirmasi kehadiran">
                  <option value="" disabled>
                    Konfirmasi kehadiran
                  </option>
                  {ATTENDANCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <textarea
                  className="rsvp-field wish-field"
                  value={message}
                  maxLength={MESSAGE_MAX}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tulis ucapan & doa untuk kedua mempelai..."
                  aria-label="Ucapan"
                  rows={4}
                />
                {/* Honeypot: tidak terlihat tamu, bot sering mengisinya */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  aria-hidden="true"
                  style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                />
                <div className="rsvp-count">
                  {message.length}/{MESSAGE_MAX}
                </div>
                <button type="submit" disabled={submitting} aria-busy={submitting} className="checkin-pass-button">
                  {submitting ? "Mengirim..." : "Kirim Ucapan"}
                </button>
                {error && (
                  <p role="alert" className="checkin-pass-error">
                    Ucapan belum terkirim: {error}
                  </p>
                )}
              </form>
            </div>
          </div>,
          document.body,
        )}

      {pass && <CheckinPassDialog intro={pass.intro} suggestedName={pass.name} onClose={() => setPass(null)} />}
    </div>
  );
};
