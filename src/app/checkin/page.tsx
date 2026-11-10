"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Bundled with the page (not loaded when the camera opens), so scanning works even if the venue connection drops first
import jsQR from "jsqr";

// Reception desk on the wedding day, on the committee's phones: log in with the shared PIN, scan guests' QR codes (or
// find them by name), add guests who are not on the list. Several phones can work at once; the list refreshes itself.

type Source = "admin" | "self" | "desk" | "paper";

interface DeskGuest {
  id: string;
  name: string;
  source: Source;
  checkedInAt: string | null;
  // Group a "self" guest came from, or a "paper" guest was filed under
  group: string | null;
}

interface Result {
  kind: "ok" | "already" | "error";
  title: string;
  detail?: string;
  guest?: DeskGuest;
}

const REFRESH_MS = 10_000;
const SEARCH_LIMIT = 40;
// The same QR held in front of the camera is read again only after this long
const RESCAN_MS = 1000;
// ...and the desk ignores a QR this long after it was scanned (after a warning / error: after the pop-up was closed), so a
// guest still holding their phone up doesn't trigger a "sudah check-in" warning, nor a foreign QR pop up again at once
const SAME_QR_IGNORE_MS = 5000;

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new Error("Koneksi internet terputus. Periksa sinyal atau WiFi HP ini, lalu coba lagi.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Terjadi kesalahan."), { status: res.status });
  return data as T;
};

const formatTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// The QR holds the guest's invitation link (…/?to=Name&g=<id>); a bare id works too
const guestIdFromQr = (text: string) => {
  try {
    const id = new URL(text).searchParams.get("g");
    if (id) return id;
  } catch {}
  return /^[0-9a-f-]{36}$/i.test(text.trim()) ? text.trim() : null;
};

const sourceLabel = (guest: DeskGuest) =>
  guest.source === "self"
    ? guest.group
      ? `Grup: ${guest.group}`
      : "Link umum"
    : guest.source === "paper"
      ? `Undangan kertas${guest.group ? ` · ${guest.group}` : ""}`
      : guest.source === "desk"
        ? "Ditambah di lokasi"
        : null;

const Spinner: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const PinScreen: React.FC<{ pinSet: boolean; onLoggedIn: () => void }> = ({ pinSet, onLoggedIn }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/checkin/session", { method: "POST", body: JSON.stringify({ pin: value }) });
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-root flex min-h-dvh items-center justify-center bg-[#f6f3ee] px-4 font-sans text-[#1f2a22]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 6) submit(pin);
        }}
        className="w-full max-w-sm rounded-2xl border border-[#e5dfd3] bg-white p-7 shadow-sm"
      >
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#8a8374]">Penerima Tamu</div>
        <h1 className="mt-1 text-2xl font-semibold">Annisa &amp; Rizki</h1>
        {!pinSet ? (
          <p className="mt-6 rounded-lg bg-[#fff7e6] p-3 text-sm text-[#7a5a12]">
            PIN panitia belum diatur. Minta admin mengatur PIN di halaman admin, tab Check-in.
          </p>
        ) : (
          <>
            <label htmlFor="desk-pin" className="mt-6 block text-sm font-medium text-[#3d463f]">
              PIN panitia
            </label>
            <input
              id="desk-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(value);
                if (value.length === 6) submit(value);
              }}
              className="mt-1.5 w-full rounded-lg border border-[#d9d2c5] px-3 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:border-[#24412f]"
            />
            {error && <p className="mt-2 text-sm text-[#9b1c1c]">{error}</p>}
            <button
              type="submit"
              disabled={busy || pin.length !== 6}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#24412f] py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {busy && <Spinner />}
              {busy ? "Memeriksa..." : "Masuk"}
            </button>
          </>
        )}
      </form>
    </div>
  );
};

// Camera preview that reads QR codes; calls onCode for each new code (the same code again only after RESCAN_MS)
const Scanner: React.FC<{ onCode: (text: string) => void; onStop: () => void }> = ({ onCode, onStop }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const last = { text: "", at: 0 };
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Browser ini tidak bisa membuka kamera. Gunakan Chrome atau Safari, atau cari nama tamu di bawah.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (err) {
        const denied = (err as DOMException).name === "NotAllowedError";
        setError(
          denied
            ? "Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, atau cari nama tamu di bawah."
            : "Kamera tidak bisa dibuka. Coba tutup aplikasi lain yang memakai kamera, atau cari nama tamu di bawah.",
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});

      let lastScan = 0;
      const scan = (time: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(scan);
        if (time - lastScan < 120 || video.readyState < 2 || !ctx) return;
        lastScan = time;
        // Decode a downscaled frame: plenty for a QR held up to the phone, and fast on older phones
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, {
          inversionAttempts: "dontInvert",
        });
        if (!code?.data) return;
        const now = Date.now();
        if (code.data === last.text && now - last.at < RESCAN_MS) return;
        last.text = code.data;
        last.at = now;
        onCodeRef.current(code.data);
      };
      frame = requestAnimationFrame(scan);
    };
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      {error ? (
        <p className="p-5 text-sm leading-relaxed text-[#f5e6d8]">{error}</p>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
          {/* Aiming frame */}
          <div className="pointer-events-none absolute inset-[16%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {/* A QR that won't read (cracked screen, too dim, too far) just shows nothing: point the way out */}
          <p className="pointer-events-none absolute inset-x-0 bottom-2 px-4 text-center text-xs leading-snug text-white/90">
            Arahkan QR ke dalam kotak. Tidak terbaca? Naikkan kecerahan layar tamu, atau cari namanya di bawah.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onStop}
        className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white"
      >
        Tutup kamera
      </button>
    </div>
  );
};

// A successful check-in closes itself after this long, so the next guest can be scanned straight away; warnings and
// errors stay until the committee taps them away
const SUCCESS_CLOSE_MS = 3000;

// Pop-up with the outcome of a scan / check-in, over everything; scans are ignored while it is open
const ResultModal: React.FC<{ result: Result; onUndo: (guest: DeskGuest) => void; onClose: () => void }> = ({ result, onUndo, onClose }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    const timer = result.kind === "ok" ? setTimeout(onClose, SUCCESS_CLOSE_MS) : undefined;
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
  }, [result, onClose]);

  const tone = {
    ok: { circle: "bg-[#1f8f4e] text-white", title: "text-[#1f6b3a]", label: "Check-in berhasil" },
    already: { circle: "bg-[#e0a526] text-white", title: "text-[#7a5a12]", label: "Perhatian" },
    error: { circle: "bg-[#b42318] text-white", title: "text-[#9b1c1c]", label: "Gagal" },
  }[result.kind];
  const icon = { ok: "✓", already: "!", error: "✕" }[result.kind];
  const group = result.guest?.group;

  return (
    <div className="admin-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1f2a22]/55 px-5 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="result-title"
        aria-describedby="result-detail"
        onClick={(e) => e.stopPropagation()}
        className="admin-modal-card relative w-full max-w-sm overflow-hidden rounded-3xl bg-white px-6 pb-6 pt-8 text-center shadow-[0_24px_60px_rgba(31,42,34,0.3)]"
      >
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold ${tone.circle}`} aria-hidden="true">
          {icon}
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-[#8a8374]">{tone.label}</p>
        <h2 id="result-title" className={`mt-1 text-2xl font-semibold leading-snug [overflow-wrap:anywhere] ${tone.title}`}>
          {result.title}
        </h2>
        {group && <p className="mt-1 text-sm text-[#8a8374]">Grup: {group}</p>}
        {result.detail && (
          <p id="result-detail" className="mt-2 text-base text-[#3d463f]">
            {result.detail}
          </p>
        )}
        <button ref={closeRef} type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-[#24412f] py-3 text-base font-semibold text-white">
          {result.kind === "ok" ? "Scan berikutnya" : "OK"}
        </button>
        {result.kind === "ok" && result.guest && (
          <button type="button" onClick={() => onUndo(result.guest!)} className="mt-3 text-sm font-medium text-[#9b1c1c] underline underline-offset-2">
            Salah tamu? Batalkan check-in
          </button>
        )}
        {/* Time left before the success pop-up closes itself */}
        {result.kind === "ok" && (
          <div
            className="checkin-result-timer absolute inset-x-0 bottom-0 h-1 origin-left bg-[#1f8f4e]"
            style={{ animationDuration: `${SUCCESS_CLOSE_MS}ms` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
};

const Desk: React.FC<{ onLoggedOut: () => void }> = ({ onLoggedOut }) => {
  const [guests, setGuests] = useState<DeskGuest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Scans arriving while the result pop-up is open are ignored (the camera keeps seeing the same QR)
  const resultOpen = useRef(false);
  useEffect(() => {
    resultOpen.current = result !== null;
  }, [result]);
  const lastScan = useRef({ id: "", at: 0 });
  const shownResult = useRef<Result | null>(null);
  useEffect(() => {
    shownResult.current = result;
  }, [result]);
  const closeResult = useCallback(() => {
    // The QR behind a warning / error is likely still in front of the camera: give the committee time to move it
    if (shownResult.current && shownResult.current.kind !== "ok") lastScan.current.at = Date.now();
    setResult(null);
  }, []);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if ((err as { status?: number }).status === 401) onLoggedOut();
      return (err as Error).message;
    },
    [onLoggedOut],
  );

  const load = useCallback(async () => {
    try {
      const data = await api<{ guests: DeskGuest[] }>("/api/checkin");
      setGuests(data.guests);
      setLoadError(null);
    } catch (err) {
      setLoadError(handleError(err));
    } finally {
      setLoaded(true);
    }
  }, [handleError]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const remember = (guest: DeskGuest) =>
    setGuests((prev) => (prev.some((g) => g.id === guest.id) ? prev.map((g) => (g.id === guest.id ? guest : g)) : [...prev, guest]));

  const checkIn = async (body: { id: string } | { name: string }) => {
    setBusyId("id" in body ? body.id : "new");
    try {
      const data = await api<{ guest: DeskGuest; already: boolean }>("/api/checkin", { method: "POST", body: JSON.stringify(body) });
      remember(data.guest);
      navigator.vibrate?.(data.already ? [70, 60, 70] : 70);
      setResult(
        data.already
          ? { kind: "already", title: data.guest.name, detail: `Sudah check-in pukul ${formatTime(data.guest.checkedInAt!)}`, guest: data.guest }
          : { kind: "ok", title: data.guest.name, detail: "Check-in berhasil. Selamat datang!", guest: data.guest },
      );
      if (!("id" in body)) setQuery("");
    } catch (err) {
      navigator.vibrate?.([120, 60, 120]);
      setResult({ kind: "error", title: "Check-in gagal", detail: handleError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const onCode = useCallback((text: string) => {
    if (resultOpen.current) return;
    const id = guestIdFromQr(text);
    const key = id ?? text;
    const now = Date.now();
    if (key === lastScan.current.id && now - lastScan.current.at < SAME_QR_IGNORE_MS) return;
    lastScan.current = { id: key, at: now };
    resultOpen.current = true;
    if (id) checkIn({ id });
    else setResult({ kind: "error", title: "Bukan QR undangan ini", detail: "Minta tamu membuka QR Check-in di undangannya, atau cari namanya di bawah." });
    // checkIn only uses state setters and stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = async (guest: DeskGuest) => {
    try {
      const data = await api<{ guest: DeskGuest }>(`/api/checkin?id=${encodeURIComponent(guest.id)}`, { method: "DELETE" });
      remember(data.guest);
      setResult({ kind: "already", title: guest.name, detail: "Check-in dibatalkan." });
    } catch (err) {
      setResult({ kind: "error", title: "Gagal membatalkan", detail: handleError(err) });
    }
  };

  const logout = async () => {
    await api("/api/checkin/session", { method: "DELETE" }).catch(() => {});
    onLoggedOut();
  };

  const checkedIn = guests.filter((g) => g.checkedInAt).length;
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return guests
      .filter((g) => g.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, SEARCH_LIMIT);
  }, [guests, q]);
  // A desk-added guest belongs to no group, so only a same-named guest outside any group blocks adding the name
  const exactMatch = guests.some((g) => !g.group && g.name.toLowerCase().replace(/\s+/g, " ") === q.replace(/\s+/g, " "));

  return (
    <div className="admin-root min-h-dvh bg-[#f6f3ee] font-sans text-[#1f2a22]">
      <header className="sticky top-0 z-10 border-b border-[#e5dfd3] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a8374]">Penerima Tamu</div>
            <div className="text-base font-semibold">Annisa &amp; Rizki</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] uppercase tracking-wider text-[#8a8374]">Sudah hadir</div>
            <div className="text-lg font-semibold text-[#1f8f4e]" aria-live="polite">
              {loaded ? (
                <>
                  {checkedIn}
                  <span className="text-sm font-normal text-[#8a8374]"> / {guests.length} tamu</span>
                </>
              ) : (
                <Spinner className="ml-auto h-4 w-4 text-[#8a8374]" />
              )}
            </div>
          </div>
          <button type="button" onClick={logout} className="ml-1 rounded-lg border border-[#d9d2c5] px-2.5 py-1.5 text-xs font-medium text-[#3d463f]">
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4 pb-16">
        {loadError && <p className="rounded-lg bg-[#fdf1f1] p-3 text-sm text-[#9b1c1c]">{loadError}</p>}

        {scanning ? (
          <Scanner onCode={onCode} onStop={() => setScanning(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex items-center justify-center gap-3 rounded-2xl bg-[#24412f] py-5 text-lg font-semibold text-white shadow-sm active:bg-[#1b3324]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
              <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
            </svg>
            Scan QR Tamu
          </button>
        )}

        {result && <ResultModal result={result} onUndo={undo} onClose={closeResult} />}

        <div className="rounded-2xl border border-[#e5dfd3] bg-white p-4">
          <label htmlFor="desk-search" className="text-sm font-semibold">
            Tamu tanpa QR? Cari namanya
          </label>
          <input
            id="desk-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama tamu..."
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-[#d9d2c5] px-3 py-2.5 text-base outline-none focus:border-[#24412f]"
          />
          {q && (
            <ul className="mt-2 divide-y divide-[#efe9de]">
              {matches.map((guest) => (
                <li key={guest.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{guest.name}</p>
                    {sourceLabel(guest) && <p className="text-xs text-[#8a8374]">{sourceLabel(guest)}</p>}
                  </div>
                  {guest.checkedInAt ? (
                    <span className="shrink-0 rounded-full bg-[#e6f4ea] px-2.5 py-1 text-xs font-medium text-[#1f6b3a]">
                      ✓ {formatTime(guest.checkedInAt)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => checkIn({ id: guest.id })}
                      disabled={busyId !== null}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#24412f] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busyId === guest.id && <Spinner className="h-3.5 w-3.5" />}
                      Check-in
                    </button>
                  )}
                </li>
              ))}
              {matches.length === 0 && <li className="py-3 text-sm text-[#8a8374]">Tidak ada tamu dengan nama itu.</li>}
            </ul>
          )}
          {q.length >= 2 && !exactMatch && (
            <button
              type="button"
              onClick={() => checkIn({ name: query })}
              disabled={busyId !== null}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#24412f] px-3 py-2.5 text-sm font-medium text-[#24412f] disabled:opacity-50"
            >
              {busyId === "new" && <Spinner className="h-3.5 w-3.5" />}
              Tambah &ldquo;{query.trim()}&rdquo; sebagai tamu baru &amp; check-in
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default function CheckinPage() {
  const [session, setSession] = useState<{ authenticated: boolean; pinSet: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      setSession(await api("/api/checkin/session"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(checkSession, 0);
    return () => clearTimeout(initial);
  }, [checkSession]);

  if (error && !session) {
    return (
      <div className="admin-root flex min-h-dvh items-center justify-center bg-[#f6f3ee] px-4 font-sans text-sm text-[#1f2a22]">
        <div className="w-full max-w-sm rounded-2xl border border-[#f0c9c9] bg-white p-6">
          <p className="font-semibold text-[#9b1c1c]">Server tidak dapat dihubungi</p>
          <p className="mt-2">{error}</p>
          <button type="button" onClick={checkSession} className="mt-4 rounded-lg border border-[#d9d2c5] px-3 py-2 font-medium">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="admin-root flex min-h-dvh items-center justify-center bg-[#f6f3ee] font-sans text-sm text-[#5c6158]" role="status">
        <span className="inline-flex items-center gap-3">
          <Spinner className="h-5 w-5 text-[#24412f]" /> Memuat...
        </span>
      </div>
    );
  }
  if (!session.authenticated) return <PinScreen pinSet={session.pinSet} onLoggedIn={checkSession} />;
  return <Desk onLoggedOut={() => setSession((s) => (s ? { ...s, authenticated: false } : s))} />;
}
