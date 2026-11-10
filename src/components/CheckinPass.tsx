"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// The guest's QR for the reception desk. A personal link (?g=<guest with a WhatsApp number>) shows that guest's QR
// straight away. A group invitation's link (?g=<guest without a number>, shared in a WhatsApp group) or the general
// link has no single person behind it: each guest types their name once to get a QR of their own, which this phone
// then remembers. The QR holds the guest's invitation link, so scanning it with an ordinary camera just opens the
// invitation.

const STORAGE_KEY = "checkin-pass";
const NAME_MAX = 80;

const BODY_FONT = "'QuattrocentoLocal', 'Quattrocento', serif";
const SCRIPT_FONT = "'SloopScript', 'Great Vibes', cursive";

interface Pass {
  id: string;
  name: string;
  // Taken from a group link (may be redone under another name)
  self: boolean;
}

const readStoredPass = (): Pass | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { id?: unknown; name?: unknown } | null;
    return typeof stored?.id === "string" && typeof stored.name === "string" ? { id: stored.id, name: stored.name, self: true } : null;
  } catch {
    return null;
  }
};

const forgetStoredPass = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
};

const qrFileName = (pass: Pass) => `QR Check-in - ${pass.name}.png`;

const passLink = (pass: Pass) => `${window.location.origin}/?to=${encodeURIComponent(pass.name)}&g=${pass.id}`;

interface CheckinPassDialogProps {
  onClose: () => void;
  // Opened right after the guest confirmed "Hadir" with a wish: a thank-you line above the QR, and the wish's name
  // ready in the name form (group and general links)
  intro?: string;
  suggestedName?: string;
}

export const CheckinPassDialog: React.FC<CheckinPassDialogProps> = ({ onClose, intro, suggestedName = "" }) => {
  const [pass, setPass] = useState<Pass | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  // The QR as a PNG file, ready before "Simpan QR" is tapped (the share sheet must open straight from the tap)
  const [qrFile, setQrFile] = useState<File | null>(null);
  // "loading" while the link's guest is looked up, then the QR or the name form; "offline" when the lookup failed
  const [view, setView] = useState<"loading" | "form" | "pass" | "offline">("loading");
  // Bumped by "Coba lagi" to look the link up again
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(suggestedName.slice(0, NAME_MAX));
  // The group invitation whose link this is, if any: new QRs are filed under it
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = setTimeout(async () => {
      const id = new URLSearchParams(window.location.search).get("g")?.trim();
      // Without an answer about the link (offline, server busy) a personal guest must not be sent to the name form
      let lookupFailed = false;
      if (id) {
        try {
          const res = await fetch(`/api/wishes/guest?g=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (!res.ok && res.status !== 404) lookupFailed = true;
          if (res.ok) {
            // `locked`: the guest has a WhatsApp number, so this is one person's own link
            const data = (await res.json()) as { name: string; locked: boolean };
            if (cancelled) return;
            if (data.locked) {
              setPass({ id, name: data.name, self: false });
              setView("pass");
              return;
            }
            setGroup({ id, name: data.name });
          }
        } catch {
          lookupFailed = true;
        }
      }
      if (cancelled) return;
      let stored = readStoredPass();
      if (stored) {
        // The admin may have removed this entry since (its QR would then be refused at the desk): start over. Offline,
        // the stored QR is still shown.
        try {
          const res = await fetch(`/api/wishes/guest?g=${encodeURIComponent(stored.id)}`, { cache: "no-store" });
          if (res.status === 404) {
            forgetStoredPass();
            stored = null;
          }
        } catch {}
      }
      if (cancelled) return;
      if (stored) {
        setPass(stored);
        setView("pass");
      } else {
        setView(lookupFailed ? "offline" : "form");
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [attempt]);

  useEffect(() => {
    if (!pass) return;
    let cancelled = false;
    import("qrcode").then(async (QRCode) => {
      const url = await QRCode.toDataURL(passLink(pass), {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 640,
        color: { dark: "#14261b", light: "#fbf6ef" },
      });
      if (cancelled) return;
      setQr(url);
      const blob = await (await fetch(url)).blob();
      if (!cancelled) setQrFile(new File([blob], qrFileName(pass), { type: "image/png" }));
    });
    return () => {
      cancelled = true;
    };
  }, [pass]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const createPass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pass", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, group: group?.id }) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; name?: string; error?: string };
      if (!res.ok || !data.id || !data.name) throw new Error(data.error ?? "QR gagal dibuat, coba lagi.");
      const created = { id: data.id, name: data.name, self: true };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: created.id, name: created.name }));
      } catch {
        // Private mode: the QR still works now, it just isn't remembered
      }
      setQr(null);
      setQrFile(null);
      setPass(created);
      setView("pass");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // On a phone the share sheet saves straight to the photos ("Simpan Gambar" on iPhone, where a download would land in
  // Files, and in-app browsers like WhatsApp's often can't download at all); elsewhere the link downloads the PNG
  const saveQr = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!qr) {
      e.preventDefault();
      return;
    }
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch || !qrFile || !navigator.canShare?.({ files: [qrFile] })) return;
    e.preventDefault();
    navigator.share({ files: [qrFile] }).catch((err: Error) => {
      // Closing the sheet is not a failure; anything else falls back to the download
      if (err.name === "AbortError" || !pass) return;
      const download = document.createElement("a");
      download.href = qr;
      download.download = qrFileName(pass);
      download.click();
    });
  };

  const redo = () => {
    forgetStoredPass();
    setName("");
    setPass(null);
    setQr(null);
    setQrFile(null);
    setView("form");
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="QR Check-in" className="checkin-pass-backdrop" onClick={onClose}>
      <div className="checkin-pass-card" onClick={(e) => e.stopPropagation()} style={{ fontFamily: BODY_FONT }}>
        <button type="button" onClick={onClose} aria-label="Tutup" className="checkin-pass-close">
          ✕
        </button>
        <p style={{ fontFamily: SCRIPT_FONT, fontSize: 40, lineHeight: "52px", margin: 0 }}>QR Check-in</p>
        {intro && <p className="checkin-pass-intro">{intro}</p>}

        {view === "loading" && <p className="checkin-pass-note">Memuat...</p>}

        {view === "offline" && (
          <>
            <p className="checkin-pass-note">QR belum bisa dimuat. Periksa koneksi internet Anda, lalu coba lagi.</p>
            <button
              type="button"
              onClick={() => {
                setView("loading");
                setAttempt((n) => n + 1);
              }}
              className="checkin-pass-button"
            >
              Coba lagi
            </button>
          </>
        )}

        {view === "form" && (
          <form onSubmit={createPass} style={{ marginTop: 8 }}>
            <p className="checkin-pass-note">
              {group ? "Undangan ini dibagikan untuk beberapa tamu. " : ""}Tuliskan nama Anda untuk membuat QR check-in pribadi, lalu simpan
              QR-nya untuk ditunjukkan kepada penerima tamu saat tiba di lokasi acara.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="Nama Anda"
              aria-label="Nama Anda"
              autoComplete="name"
              className="wish-field checkin-pass-input"
            />
            {error && (
              <p role="alert" className="checkin-pass-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || name.trim().length < 2} className="checkin-pass-button">
              {busy ? "Membuat QR..." : "Buat QR"}
            </button>
          </form>
        )}

        {view === "pass" && pass && (
          <>
            <p className="checkin-pass-name">{pass.name}</p>
            <div className="checkin-pass-qr" data-allow-save="">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR check-in untuk ${pass.name}`} width={240} height={240} />
              ) : (
                <span className="checkin-pass-note">Membuat QR...</span>
              )}
            </div>
            <p className="checkin-pass-note">
              Simpan QR ini (atau screenshot layar), lalu tunjukkan kepada penerima tamu saat tiba di lokasi acara agar check-in lebih cepat.
            </p>
            <a
              href={qr ?? undefined}
              download={qrFileName(pass)}
              onClick={saveQr}
              aria-disabled={!qr}
              className="checkin-pass-button"
              style={{ display: "block", textDecoration: "none" }}
            >
              Simpan QR
            </a>
            {pass.self && (
              <button type="button" onClick={redo} className="checkin-pass-link">
                Bukan nama Anda? Buat ulang
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
