"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { attendanceLabel, type Attendance } from "@/lib/wishValidation";
import { formatPhone, normalizePhone } from "@/lib/phone";

// Desktop admin: manage guest wishes and send personalised WhatsApp invitations

interface Wish {
  id: string;
  name: string;
  message: string;
  attendance?: Attendance;
  // Guest list entry whose link it was sent from (personal or group invitation)
  guestId?: string;
  // The WhatsApp group it was sent from; the invitation shows it as "Group - Name"
  group?: string | null;
  createdAt: string;
}

// Newest entries on top. The sort is stable, so guests added together in one batch (same time) keep the order they
// were typed in.
const newestFirst = <T extends { createdAt: string }>(items: T[]) => [...items].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

const wishName = (wish: Wish) => (wish.group ? `${wish.group} - ${wish.name}` : wish.name);

interface Guest {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  sentAt: string | null;
  attendance?: Attendance | null;
  respondedAt?: string | null;
  // Added in this admin, or a paper invitation added in the guest list; missing = "admin". ("self" / "desk" only on
  // older data from the removed QR check-in.)
  source?: "admin" | "self" | "desk" | "paper";
  groupId?: string | null;
}

interface InviteSettings {
  template: string;
}

type Tab = "wishes" | "guests" | "invites";

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Terjadi kesalahan."), { status: res.status });
  return data as T;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Personal link: ?to shows the name on the envelope, ?g ties wishes sent from it to this guest (name locked in the form)
// The invitation's public address; NEXT_PUBLIC_SITE_URL overrides it (e.g. a custom domain, with or without https://)
// Without it, the address the admin page is opened on (the Vercel production domain) is used.
const CUSTOM_SITE_URL = (() => {
  const custom = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (!custom) return "";
  return /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
})();
const siteUrl = () => CUSTOM_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

const inviteLink = (guest: { name: string; id?: string }) =>
  `${siteUrl()}/?to=${encodeURIComponent(guest.name)}${guest.id ? `&g=${guest.id}` : ""}`;

const renderMessage = (template: string, guest: { name: string; id?: string }) =>
  template.replaceAll("{nama}", guest.name).replaceAll("{link}", inviteLink(guest));

const whatsappUrl = (phone: string | null, text: string) =>
  `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;

// Bulk import: one guest per line, "Nama, 0812..." (the number is optional; tab or semicolon also work)
const parseBulk = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)[,;\t]\s*([+\d][\d\s-]*)$/);
      return match ? { name: match[1].trim(), phone: match[2].trim() } : { name: line, phone: "" };
    });

const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "whatsapp";
    ref?: React.Ref<HTMLButtonElement>;
  }
> = ({ variant = "secondary", className = "", ...props }) => {
  const styles = {
    primary: "bg-[#24412f] text-white hover:bg-[#1b3324] disabled:bg-[#24412f]/50",
    secondary: "bg-white text-[#24412f] border border-[#d9d2c5] hover:bg-[#f3efe7] disabled:opacity-50",
    danger: "bg-white text-[#9b1c1c] border border-[#ecc8c8] hover:bg-[#fdf1f1] disabled:opacity-50",
    whatsapp: "bg-[#1f8f4e] text-white hover:bg-[#187a41] disabled:opacity-50",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
};

// Clipboard with a fallback for browsers / contexts where the async clipboard API is missing or refused
const writeClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Gagal menyalin, salin manual.");
  }
};

// A copy button that answers on itself: "✓ Disalin" for a moment (the page notice may be scrolled out of view)
const CopyButton: React.FC<{ text: string | (() => string); label: string; className?: string; variant?: "primary" | "secondary" }> = ({
  text,
  label,
  className = "",
  variant,
}) => {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  const copy = async () => {
    try {
      await writeClipboard(typeof text === "function" ? text() : text);
      setState("done");
    } catch {
      setState("error");
    }
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button
      onClick={copy}
      variant={variant}
      aria-live="polite"
      className={`${className} ${state === "done" ? "!border-[#9fd0ae] !bg-[#e6f4ea] !text-[#1f6b3a]" : ""} ${state === "error" ? "!text-[#9b1c1c]" : ""}`}
    >
      {state === "done" ? "✓ Disalin" : state === "error" ? "Gagal menyalin" : label}
    </Button>
  );
};

// WhatsApp's *bold* in the other apps: Discord writes it **bold**, Instagram has no formatting
const forDiscord = (text: string) => text.replace(/\*([^*\n]+)\*/g, "**$1**");
const forInstagram = (text: string) => text.replace(/\*([^*\n]+)\*/g, "$1");

// Brand marks for the share menu, drawn inline (no external images)
const DiscordLogo: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const InstagramLogo: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

const ShareIcon: React.FC<{ className?: string }> = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

const SHARE_TARGETS = [
  {
    key: "discord",
    label: "Discord",
    hint: "Salin pesan & buka Discord",
    url: "https://discord.com/channels/@me",
    format: forDiscord,
    tile: "bg-[#5865F2] text-white",
    Logo: DiscordLogo,
  },
  {
    key: "instagram",
    label: "Instagram",
    hint: "Salin pesan & buka DM",
    url: "https://www.instagram.com/direct/inbox/",
    format: forInstagram,
    tile: "bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fd5949_45%,#d6249f_60%,#285AEB_90%)] text-white",
    Logo: InstagramLogo,
  },
] as const;

const MENU_W = 288;
const MENU_H = 250;

// "Bagikan" menu for apps without a link that fills in a message (Discord, Instagram): the message is copied, the
// app opens in a new tab, and it is pasted into the chat there. "Lainnya" opens the device's share sheet when the
// browser has one. The menu is drawn in a portal so the table's rounded clipping can't cut it off.
const ShareMenu: React.FC<{ message: () => string; onShared?: () => void; className?: string }> = ({ message, onShared, className = "" }) => {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const flash = (ok: boolean, text: string) => {
    setDone({ ok, text });
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setDone(null), 4000);
  };

  const shareTo = async (target: (typeof SHARE_TARGETS)[number]) => {
    setOpen(null);
    try {
      // Copied before the tab opens: the clipboard needs this page to still have focus
      await writeClipboard(target.format(message()));
    } catch {
      flash(false, "Gagal menyalin");
      return;
    }
    window.open(target.url, "_blank", "noopener");
    flash(true, "✓ Disalin");
    onShared?.();
  };

  const shareOther = async () => {
    setOpen(null);
    try {
      await navigator.share({ text: forInstagram(message()) });
      onShared?.();
    } catch {
      // Closed the sheet
    }
  };

  const below = open ? open.bottom + 8 + MENU_H <= window.innerHeight : true;
  const item = "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#f6f3ee] focus-visible:bg-[#f6f3ee] focus-visible:outline-none";

  return (
    <>
      <Button
        ref={buttonRef}
        onClick={() => setOpen(open ? null : (buttonRef.current?.getBoundingClientRect() ?? null))}
        aria-haspopup="menu"
        aria-expanded={!!open}
        className={`${className} gap-1.5 ${done?.ok ? "!border-[#9fd0ae] !bg-[#e6f4ea] !text-[#1f6b3a]" : ""} ${done && !done.ok ? "!text-[#9b1c1c]" : ""} ${open ? "!bg-[#f3efe7]" : ""}`}
      >
        {done ? (
          done.text
        ) : (
          <>
            <ShareIcon />
            Bagikan
          </>
        )}
      </Button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
            <div
              role="menu"
              aria-label="Bagikan undangan"
              className="admin-modal-card fixed z-50 rounded-2xl border border-[#e5dfd3] bg-white p-2 text-sm shadow-[0_16px_40px_rgba(31,42,34,0.2)]"
              style={{
                width: MENU_W,
                top: below ? open.bottom + 8 : undefined,
                bottom: below ? undefined : window.innerHeight - open.top + 8,
                left: Math.min(window.innerWidth - MENU_W - 8, Math.max(8, open.right - MENU_W)),
              }}
            >
              <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[#8a8374]">Bagikan ke</div>
              {SHARE_TARGETS.map((target) => (
                <button key={target.key} role="menuitem" type="button" onClick={() => shareTo(target)} className={item}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${target.tile}`}>
                    <target.Logo className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#1f2a22]">{target.label}</span>
                    <span className="block text-xs text-[#8a8374]">{target.hint}</span>
                  </span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-[#c4bcae] transition-colors group-hover:text-[#24412f]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17 17 7M8 7h9v9" />
                  </svg>
                </button>
              ))}
              {canShare && (
                <button role="menuitem" type="button" onClick={shareOther} className={item}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#efe9de] text-[#24412f]">
                    <ShareIcon className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#1f2a22]">Lainnya</span>
                    <span className="block text-xs text-[#8a8374]">Menu bagikan perangkat</span>
                  </span>
                </button>
              )}
              <p className="mx-1 mt-1.5 rounded-lg bg-[#faf8f4] px-2.5 py-2 text-xs leading-relaxed text-[#6f6858]">
                Setelah aplikasi terbuka, pilih chat lalu tempel pesannya (<kbd className="font-sans font-semibold">Ctrl/⌘ + V</kbd>).
              </p>
            </div>
          </>,
          document.body,
        )}
    </>
  );
};

const Spinner: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const SkeletonBar: React.FC<{ className?: string }> = ({ className = "h-4 w-full" }) => (
  <div className={`animate-pulse rounded bg-[#ece6da] ${className}`} />
);

// Placeholder rows while a table loads for the first time
const SkeletonRows: React.FC<{ columns: string[]; rows?: number }> = ({ columns, rows = 4 }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <tr key={row} aria-hidden="true">
        {columns.map((width, col) => (
          <td key={col} className="px-4 py-4">
            <SkeletonBar className={`h-4 ${width}`} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

// While data reloads, the existing rows stay visible but dimmed
const LoadingCaption: React.FC = () => (
  <caption className="caption-bottom py-3 text-sm text-[#8a8374]">
    <span className="inline-flex items-center gap-2">
      <Spinner /> Memuat data...
    </span>
  </caption>
);

const PAGE_SIZES = [10, 25, 50];

// Client-side paging of an already loaded list; the page is clamped so deleting the last row of a page stays valid
const usePagination = <T,>(items: T[]) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageItems = items.slice((current - 1) * pageSize, current * pageSize);
  return { page: current, pageCount, pageSize, pageItems, total: items.length, setPage, setPageSize };
};

// Page numbers with ellipses: 1 … 4 5 6 … 12
const pageList = (page: number, pageCount: number): (number | "gap")[] => {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((n, idx) => (idx > 0 && n - sorted[idx - 1] > 1 ? (["gap", n] as const) : [n]));
};

const Pagination: React.FC<ReturnType<typeof usePagination<unknown>>> = ({ page, pageCount, pageSize, total, setPage, setPageSize }) => {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const navButton = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#efe9de] bg-[#faf8f4] px-4 py-2.5 text-sm text-[#5c6158]">
      <div className="flex items-center gap-3">
        <span>
          Menampilkan <span className="font-medium text-[#1f2a22]">{from}–{to}</span> dari {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          aria-label="Baris per halaman"
          className="rounded-lg border border-[#d9d2c5] bg-white px-2 py-1 text-sm outline-none focus:border-[#24412f]"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / halaman
            </option>
          ))}
        </select>
      </div>
      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Halaman">
          <button type="button" className={`${navButton} hover:bg-[#efe9de]`} disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Halaman sebelumnya">
            ‹
          </button>
          {pageList(page, pageCount).map((item, idx) =>
            item === "gap" ? (
              <span key={`gap-${idx}`} className="px-1 text-[#b3ab9c]">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                aria-current={item === page ? "page" : undefined}
                className={`${navButton} ${item === page ? "bg-[#24412f] font-medium text-white" : "hover:bg-[#efe9de]"}`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${navButton} hover:bg-[#efe9de]`}
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
            aria-label="Halaman berikutnya"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; loading?: boolean; tone?: string }> = ({
  label,
  value,
  loading = false,
  tone = "text-[#24412f]",
}) => (
  <div className="rounded-xl border border-[#e5dfd3] bg-white px-5 py-4">
    <div className="text-xs font-medium uppercase tracking-wider text-[#8a8374]">{label}</div>
    {loading ? <SkeletonBar className="mt-2.5 h-7 w-14" /> : <div className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</div>}
  </div>
);

// Confirmation modal for destructive actions (instead of the browser's confirm dialog). The modal stays open while
// the action runs, showing progress, and closes when it finishes.
interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  action: () => Promise<void>;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => void>(() => {});
const useConfirm = () => useContext(ConfirmContext);

const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: ConfirmOptions) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOptions(next);
  }, []);

  const close = useCallback(() => {
    setOptions(null);
    returnFocusRef.current?.focus();
  }, []);

  const confirm = async () => {
    if (!options) return;
    setBusy(true);
    try {
      await options.action();
    } finally {
      setBusy(false);
      close();
    }
  };

  useEffect(() => {
    if (!options) return;
    // Default focus on "Batal" so pressing Enter never deletes by accident
    cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options, busy, close]);

  return (
    <ConfirmContext.Provider value={open}>
      {children}
      {options && (
        <div
          className="admin-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1f2a22]/45 backdrop-blur-[2px]"
          onClick={() => !busy && close()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onClick={(e) => e.stopPropagation()}
            className="admin-modal-card w-[420px] rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(31,42,34,0.25)]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdecec] text-[#9b1c1c]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-[#1f2a22]">
                  {options.title}
                </h2>
                <div id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-[#5c645d]">
                  {options.message}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button ref={cancelRef} onClick={close} disabled={busy}>
                Batal
              </Button>
              <button
                onClick={confirm}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#b42318] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#9b1c1c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy && <span className="admin-spinner h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                {busy ? options.busyLabel : options.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

const LoginScreen: React.FC<{ configured: boolean; onLoggedIn: () => void }> = ({ configured, onLoggedIn }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-root flex min-h-screen items-center justify-center bg-[#f6f3ee] font-sans text-[#1f2a22]">
      <form onSubmit={submit} className="w-[380px] rounded-2xl border border-[#e5dfd3] bg-white p-8 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#8a8374]">Admin Undangan</div>
        <h1 className="mt-1 text-2xl font-semibold text-[#1f2a22]">Annisa &amp; Rizki</h1>
        {!configured ? (
          <p className="mt-6 rounded-lg bg-[#fff7e6] p-3 text-sm text-[#7a5a12]">
            Belum ada akun admin. Jalankan <code className="font-mono">pnpm db:seed</code>, atau atur{" "}
            <code className="font-mono">ADMIN_PASSWORD</code> di environment server lalu muat ulang halaman ini.
          </p>
        ) : (
          <>
            <label className="mt-6 block text-sm font-medium text-[#3d463f]" htmlFor="admin-username">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[#d9d2c5] px-3 py-2.5 text-[#1f2a22] outline-none focus:border-[#24412f]"
            />
            <label className="mt-4 block text-sm font-medium text-[#3d463f]" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[#d9d2c5] px-3 py-2.5 text-[#1f2a22] outline-none focus:border-[#24412f]"
            />
            {error && <p className="mt-2 text-sm text-[#9b1c1c]">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy || !username.trim() || !password} className="mt-5 w-full py-2.5">
              {busy ? "Memeriksa..." : "Masuk"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
};

const WishesTab: React.FC<{ onAuthError: () => void }> = ({ onAuthError }) => {
  const confirm = useConfirm();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  // False until the first load finishes: skeletons instead of an empty table
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Attendance>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWishes((await api<{ wishes: Wish[] }>("/api/admin/wishes")).wishes);
      setError(null);
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError();
      else setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [onAuthError]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const remove = (wish: Wish) =>
    confirm({
      title: "Hapus ucapan?",
      message: (
        <>
          Ucapan dari <span className="font-semibold text-[#1f2a22]">{wishName(wish)}</span> akan dihapus permanen dan tidak tampil lagi
          di undangan.
        </>
      ),
      confirmLabel: "Hapus Ucapan",
      busyLabel: "Menghapus...",
      action: async () => {
        try {
          await api(`/api/admin/wishes?id=${encodeURIComponent(wish.id)}`, { method: "DELETE" });
          setWishes((prev) => prev.filter((w) => w.id !== wish.id));
        } catch (err) {
          if ((err as { status?: number }).status === 401) onAuthError();
          else setError((err as Error).message);
        }
      },
    });

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ["Nama", "Kehadiran", "Ucapan", "Waktu"],
      ...wishes.map((w) => [wishName(w), w.attendance ? attendanceLabel(w.attendance) : "-", w.message, formatDate(w.createdAt)]),
    ];
    const blob = new Blob(["﻿" + rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ucapan-annisa-rizki.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wishes.filter(
      (w) => (filter === "all" || w.attendance === filter) && (!q || wishName(w).toLowerCase().includes(q) || w.message.toLowerCase().includes(q)),
    );
  }, [wishes, query, filter]);
  const pagination = usePagination(visible);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Ucapan" value={wishes.length} loading={!loaded} />
        <StatCard label="Hadir" value={wishes.filter((w) => w.attendance === "hadir").length} loading={!loaded} tone="text-[#1f8f4e]" />
        <StatCard
          label="Tidak Hadir"
          value={wishes.filter((w) => w.attendance === "tidak_hadir").length}
          loading={!loaded}
          tone="text-[#9b1c1c]"
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            pagination.setPage(1);
          }}
          placeholder="Cari nama atau isi ucapan..."
          className="w-80 rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]"
        />
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            pagination.setPage(1);
          }}
          className="rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]"
        >
          <option value="all">Semua kehadiran</option>
          <option value="hadir">Hadir</option>
          <option value="tidak_hadir">Tidak Hadir</option>
        </select>
        <div className="ml-auto flex gap-2">
          <Button onClick={load} disabled={loading}>
            {loading && <Spinner />}
            {loading ? "Memuat..." : "Muat Ulang"}
          </Button>
          <Button onClick={exportCsv} disabled={wishes.length === 0}>
            Ekspor CSV
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-[#fdf1f1] p-3 text-sm text-[#9b1c1c]">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-[#e5dfd3] bg-white">
        {/* Fixed layout: a long message (even one unbroken word) wraps inside its column instead of pushing the
            delete button out of view */}
        <table className={`w-full table-fixed text-left text-sm transition-opacity ${loading && loaded ? "opacity-50" : ""}`} aria-busy={loading}>
          {loading && loaded && <LoadingCaption />}
          <thead className="bg-[#faf8f4] text-xs uppercase tracking-wider text-[#8a8374]">
            <tr>
              <th className="w-48 px-4 py-3 font-medium">Nama</th>
              <th className="w-32 px-4 py-3 font-medium">Kehadiran</th>
              <th className="px-4 py-3 font-medium">Ucapan</th>
              <th className="w-44 px-4 py-3 font-medium">Waktu</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#efe9de] text-[#1f2a22]">
            {!loaded && <SkeletonRows columns={["w-28", "w-16", "w-full", "w-28", "ml-auto w-14"]} />}
            {pagination.pageItems.map((wish) => (
              <tr key={wish.id} className="align-top hover:bg-[#fcfbf8]">
                <td className="px-4 py-3 font-medium [overflow-wrap:anywhere]">{wishName(wish)}</td>
                <td className="px-4 py-3">
                  {wish.attendance ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        wish.attendance === "hadir" ? "bg-[#e6f4ea] text-[#1f6b3a]" : "bg-[#f6eded] text-[#8a2a2a]"
                      }`}
                    >
                      {attendanceLabel(wish.attendance)}
                    </span>
                  ) : (
                    <span className="text-[#b3ab9c]">-</span>
                  )}
                </td>
                <td className="whitespace-pre-line px-4 py-3 text-[#3d463f] [overflow-wrap:anywhere]">{wish.message}</td>
                <td className="px-4 py-3 text-[#8a8374]">{formatDate(wish.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" onClick={() => remove(wish)} className="px-2.5 py-1.5 text-xs">
                    Hapus
                  </Button>
                </td>
              </tr>
            ))}
            {loaded && !loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[#8a8374]">
                  {wishes.length === 0 ? "Belum ada ucapan yang masuk." : "Tidak ada ucapan yang cocok dengan pencarian."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loaded && <Pagination {...pagination} />}
      </div>
    </div>
  );
};

// WhatsApp-style preview: *bold* shown bold, as the guest will see it
const WhatsAppText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*[^*\n]+\*)/g).map((part, idx) =>
      /^\*[^*\n]+\*$/.test(part) ? <strong key={idx}>{part.slice(1, -1)}</strong> : <React.Fragment key={idx}>{part}</React.Fragment>,
    )}
  </>
);

// Side panel with the message template next to its live preview for one guest (picked here or with the eye button on
// a row), and the send / copy / share actions for that guest. Closing with unsaved edits asks first (InvitesTab).
const TemplateDrawer: React.FC<{
  template: string;
  onTemplateChange: (template: string) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<string | null>;
  onRestoreDefault: () => void;
  guests: Guest[];
  previewGuest: Guest | undefined;
  onPreviewGuest: (id: string) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onShared: (guest: Guest) => void;
  onClose: () => void;
}> = ({ template, onTemplateChange, dirty, saving, onSave, onRestoreDefault, guests, previewGuest, onPreviewGuest, onSendWhatsApp, onShared, onClose }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sample = previewGuest ?? { name: "Nama Tamu" };
  const options = useMemo(() => newestFirst(guests), [guests]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The "discard changes?" dialog handles its own Escape
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => clearTimeout(savedTimer.current ?? undefined), []);

  const save = async () => {
    const problem = await onSave();
    setSaveError(problem);
    if (problem) return;
    setSaved(true);
    clearTimeout(savedTimer.current ?? undefined);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  };

  // Puts {nama} / {link} where the cursor is
  const insert = (token: string) => {
    const area = textareaRef.current;
    if (!area) return onTemplateChange(template + token);
    const { selectionStart: from, selectionEnd: to } = area;
    onTemplateChange(template.slice(0, from) + token + template.slice(to));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const missing = ["{nama}", "{link}"].filter((token) => !template.includes(token));

  return (
    <div className="admin-modal-backdrop fixed inset-0 z-40 flex justify-end bg-[#1f2a22]/35 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="admin-drawer flex h-full w-[min(940px,100vw)] flex-col bg-[#f6f3ee] text-[#1f2a22] shadow-[-24px_0_60px_rgba(31,42,34,0.25)]"
      >
        <header className="flex items-center gap-3 border-b border-[#e5dfd3] bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="template-drawer-title" className="text-base font-semibold text-[#1f2a22]">
              Template Pesan WhatsApp
            </h2>
            <p className="mt-0.5 text-xs text-[#8a8374]">Dipakai untuk Kirim WA, Salin Pesan, dan Bagikan ke Discord / Instagram.</p>
          </div>
          {dirty ? (
            <span className="rounded-full bg-[#fbf3e3] px-2.5 py-1 text-xs font-medium text-[#8a5a0e]">Belum disimpan</span>
          ) : saved ? (
            <span className="rounded-full bg-[#e6f4ea] px-2.5 py-1 text-xs font-medium text-[#1f6b3a]">✓ Tersimpan</span>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-[#5c645d] hover:bg-[#f3efe7]">
            ✕
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-5 overflow-y-auto p-6">
          {/* Editor */}
          <section className="flex min-h-0 flex-col rounded-xl border border-[#e5dfd3] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#1f2a22]">Isi pesan</h3>
              <div className="flex gap-1.5">
                {["{nama}", "{link}"].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insert(token)}
                    title={`Sisipkan ${token} di posisi kursor`}
                    className="rounded-md border border-[#d9d2c5] bg-[#faf8f4] px-2 py-1 font-mono text-xs text-[#24412f] hover:bg-[#f3efe7]"
                  >
                    + {token}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#8a8374]">
              <code className="font-mono">{"{nama}"}</code> diganti nama tamu, <code className="font-mono">{"{link}"}</code> diganti link
              undangannya. Teks di antara *bintang* jadi tebal.
            </p>
            <textarea
              ref={textareaRef}
              value={template}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="mt-3 min-h-[360px] w-full flex-1 resize-none rounded-lg border border-[#d9d2c5] px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-[#24412f]"
            />
            {saveError && <p className="mt-2 rounded-lg bg-[#fdf1f1] px-3 py-2 text-xs text-[#9b1c1c]">Gagal menyimpan: {saveError}</p>}
            {missing.length > 0 && (
              <p className="mt-2 rounded-lg bg-[#fbf3e3] px-3 py-2 text-xs text-[#8a5a0e]">
                Template belum memuat {missing.join(" dan ")}
                {missing.includes("{link}") ? ": tamu tidak akan mendapat link undangannya." : "."}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={save} disabled={!dirty || saving}>
                {saving && <Spinner />}
                {saving ? "Menyimpan..." : "Simpan Template"}
              </Button>
              <Button onClick={onRestoreDefault}>Kembalikan Default</Button>
            </div>
          </section>

          {/* Preview */}
          <section className="flex min-h-0 flex-col rounded-xl border border-[#e5dfd3] bg-[#e9e3d6] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#1f2a22]">Pratinjau</h3>
              {options.length > 0 && (
                <label className="flex min-w-0 items-center gap-2 text-xs text-[#6f6858]">
                  untuk
                  <select
                    value={previewGuest?.id ?? ""}
                    onChange={(e) => onPreviewGuest(e.target.value)}
                    className="max-w-[220px] truncate rounded-lg border border-[#d9d2c5] bg-white px-2 py-1.5 text-xs text-[#1f2a22] outline-none focus:border-[#24412f]"
                  >
                    {options.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {guest.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl bg-[#efe7dc] p-3">
              <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2.5 text-sm leading-relaxed text-[#1f2a22] shadow-sm">
                <WhatsAppText text={renderMessage(template, sample)} />
              </div>
            </div>
            {previewGuest ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="whatsapp" onClick={() => onSendWhatsApp(previewGuest)}>
                  Kirim WA
                </Button>
                <CopyButton text={() => renderMessage(template, previewGuest)} label="Salin Pesan" className="w-[118px]" />
                <ShareMenu message={() => renderMessage(template, previewGuest)} onShared={() => onShared(previewGuest)} className="w-[118px]" />
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#6f6858]">Tambahkan tamu untuk mengirim pesan dari sini.</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};

const InvitesTab: React.FC<{ onAuthError: () => void }> = ({ onAuthError }) => {
  const confirm = useConfirm();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [settings, setSettings] = useState<InviteSettings>({ template: "" });
  const [defaultTemplate, setDefaultTemplate] = useState("");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  // False until the first load finishes: skeletons instead of an empty table and template
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bulk, setBulk] = useState("");
  // Which save is running (the single "Tambah" form, the bulk import, the message template): spinner on its button,
  // and no second click while it runs
  const [saving, setSaving] = useState<"single" | "bulk" | "template" | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "unsent">("all");
  const [previewId, setPreviewId] = useState<string | null>(null);
  // The message template and its preview live in a side panel, so the guest list gets the full width
  const [templateOpen, setTemplateOpen] = useState(false);
  // The template as last saved, to throw away unsaved edits when the panel is closed
  const [savedTemplate, setSavedTemplate] = useState("");

  const handleError = useCallback(
    (err: unknown) => {
      if ((err as { status?: number }).status === 401) onAuthError();
      else setNotice({ kind: "error", text: (err as Error).message });
    },
    [onAuthError],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guestData, settingsData] = await Promise.all([
        api<{ guests: Guest[] }>("/api/admin/guests"),
        api<{ settings: InviteSettings; defaultTemplate: string }>("/api/admin/settings"),
      ]);
      // Only guests added here get an invitation link (paper-invitation guests have none)
      setGuests(guestData.guests.filter((guest) => (guest.source ?? "admin") === "admin"));
      setSettings(settingsData.settings);
      setSavedTemplate(settingsData.settings.template);
      setDefaultTemplate(settingsData.defaultTemplate);
      setSettingsDirty(false);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [handleError]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const addEntries = async (entries: { name: string; phone: string }[], kind: "single" | "bulk", onDone: () => void) => {
    if (saving) return;
    const invalid = entries.find((entry) => entry.phone && !normalizePhone(entry.phone));
    if (invalid) {
      setNotice({ kind: "error", text: `Nomor WhatsApp untuk "${invalid.name}" tidak valid.` });
      return;
    }
    setSaving(kind);
    setNotice(null);
    try {
      const data = await api<{ guests: Guest[] }>("/api/admin/guests", { method: "POST", body: JSON.stringify({ guests: entries }) });
      setGuests((prev) => [...prev, ...data.guests]);
      pagination.setPage(1); // the new guests are on top
      setNotice({ kind: "success", text: `${data.guests.length} tamu ditambahkan.` });
      onDone();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(null);
    }
  };

  // Null when saved, else the error; a failure is reported by the caller (the template panel covers the page notice)
  const saveSettings = async (): Promise<string | null> => {
    if (saving) return "Masih menyimpan, tunggu sebentar.";
    setSaving("template");
    try {
      const data = await api<{ settings: InviteSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(data.settings);
      setSavedTemplate(data.settings.template);
      setSettingsDirty(false);
      setNotice({ kind: "success", text: "Template pesan disimpan." });
      return null;
    } catch (err) {
      handleError(err);
      return (err as Error).message;
    } finally {
      setSaving(null);
    }
  };

  const setSent = async (guest: Guest, sent: boolean) => {
    try {
      const data = await api<{ guest: Guest }>("/api/admin/guests", { method: "PATCH", body: JSON.stringify({ id: guest.id, sent }) });
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? data.guest : g)));
    } catch (err) {
      handleError(err);
    }
  };

  const resetAllSentStatus = () =>
    confirm({
      title: "Reset semua status terkirim?",
      message: (
        <>
          <span className="font-semibold text-[#1f2a22]">{guests.filter((g) => g.sentAt).length} tamu</span> yang bertanda
          &ldquo;Terkirim&rdquo; akan kembali menjadi &ldquo;Belum dikirim&rdquo;. Pesan yang sudah terkirim tidak terpengaruh, dan
          konfirmasi kehadiran tamu tetap tersimpan.
        </>
      ),
      confirmLabel: "Reset Status",
      busyLabel: "Mereset...",
      action: async () => {
        try {
          const data = await api<{ reset: number }>("/api/admin/guests", { method: "PATCH", body: JSON.stringify({ resetSent: "all" }) });
          setGuests((prev) => prev.map((g) => (g.sentAt ? { ...g, sentAt: null } : g)));
          setNotice({ kind: "success", text: `Status terkirim ${data.reset} tamu direset.` });
        } catch (err) {
          handleError(err);
        }
      },
    });

  const sendWhatsApp = (guest: Guest) => {
    window.open(whatsappUrl(guest.phone, renderMessage(settings.template, guest)), "_blank", "noopener");
    if (!guest.sentAt) setSent(guest, true);
  };

  const remove = (guest: Guest) =>
    confirm({
      title: "Hapus tamu?",
      message: (
        <>
          <span className="font-semibold text-[#1f2a22]">{guest.name}</span> akan dihapus dari daftar tamu. Link undangan yang sudah
          terkirim tetap bisa dibuka.
        </>
      ),
      confirmLabel: "Hapus Tamu",
      busyLabel: "Menghapus...",
      action: async () => {
        try {
          await api(`/api/admin/guests?id=${encodeURIComponent(guest.id)}`, { method: "DELETE" });
          setGuests((prev) => prev.filter((g) => g.id !== guest.id));
        } catch (err) {
          handleError(err);
        }
      },
    });

  const openTemplate = (guest?: Guest) => {
    if (guest) setPreviewId(guest.id);
    setTemplateOpen(true);
  };

  // Unsaved edits are only thrown away after asking
  const closeTemplate = () => {
    if (!settingsDirty) {
      setTemplateOpen(false);
      return;
    }
    confirm({
      title: "Buang perubahan template?",
      message: "Perubahan pada template pesan belum disimpan. Jika ditutup sekarang, template kembali ke versi terakhir yang disimpan.",
      confirmLabel: "Buang Perubahan",
      busyLabel: "Menutup...",
      action: async () => {
        setSettings((current) => ({ ...current, template: savedTemplate }));
        setSettingsDirty(false);
        setTemplateOpen(false);
      },
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const matchesQuery = (g: Guest) => !q || g.name.toLowerCase().includes(q) || (digits !== "" && (g.phone ?? "").includes(digits));
    return newestFirst(guests).filter((g) => (statusFilter === "all" || (statusFilter === "sent" ? g.sentAt : !g.sentAt)) && matchesQuery(g));
  }, [guests, query, statusFilter]);
  const pagination = usePagination(visible);

  const previewGuest = guests.find((g) => g.id === previewId) ?? guests[0];
  const sentCount = guests.filter((g) => g.sentAt).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Tamu" value={guests.length} loading={!loaded} />
        <StatCard label="Sudah Dikirim" value={sentCount} loading={!loaded} tone="text-[#1f8f4e]" />
        <StatCard label="Belum Dikirim" value={guests.length - sentCount} loading={!loaded} tone="text-[#a06a12]" />
      </div>

      {notice && (
        <div
          className={`mt-4 flex items-start justify-between whitespace-pre-line rounded-lg p-3 text-sm ${
            notice.kind === "error" ? "bg-[#fdf1f1] text-[#9b1c1c]" : "bg-[#e9f5ec] text-[#1f6b3a]"
          }`}
        >
          {notice.text}
          <button onClick={() => setNotice(null)} className="ml-4 opacity-60 hover:opacity-100" aria-label="Tutup">
            ✕
          </button>
        </div>
      )}

      <div className="mt-6">
        {/* Guest list (full width; the message template opens in a side panel) */}
        <div>
          <div className="rounded-xl border border-[#e5dfd3] bg-white p-5">
            <h2 className="text-base font-semibold text-[#1f2a22]">Tambah Tamu</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addEntries([{ name, phone }], "single", () => {
                  setName("");
                  setPhone("");
                });
              }}
              className="mt-3 flex gap-3"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama tamu (mis. Bapak Ahmad & Keluarga)"
                className="flex-1 rounded-lg border border-[#d9d2c5] px-3 py-2 text-sm outline-none focus:border-[#24412f]"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="No. WhatsApp (opsional)"
                className="w-56 rounded-lg border border-[#d9d2c5] px-3 py-2 text-sm outline-none focus:border-[#24412f]"
              />
              <Button type="submit" variant="primary" disabled={name.trim().length < 2 || saving !== null} className="w-[136px]">
                {saving === "single" && <Spinner />}
                {saving === "single" ? "Menambah..." : "Tambah"}
              </Button>
            </form>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-[#24412f]">Impor banyak tamu sekaligus</summary>
              <p className="mt-2 text-xs text-[#8a8374]">
                Satu tamu per baris, format <code className="font-mono">Nama, 08123456789</code>. Nomor boleh dikosongkan.
              </p>
              <textarea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                rows={5}
                placeholder={"Bapak Ahmad & Keluarga, 081234567890\nSiti Aminah, 0857-1111-2222\nRekan Kantor"}
                className="mt-2 w-full rounded-lg border border-[#d9d2c5] px-3 py-2 font-mono text-sm outline-none focus:border-[#24412f]"
              />
              <Button
                className="mt-2"
                variant="primary"
                disabled={!bulk.trim() || saving !== null}
                onClick={() => addEntries(parseBulk(bulk), "bulk", () => setBulk(""))}
              >
                {saving === "bulk" && <Spinner />}
                {saving === "bulk" ? `Mengimpor ${parseBulk(bulk).length} tamu...` : `Impor ${parseBulk(bulk).length || ""} Tamu`}
              </Button>
            </details>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                pagination.setPage(1);
              }}
              placeholder="Cari nama atau nomor..."
              className="w-72 rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                pagination.setPage(1);
              }}
              className="rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]"
            >
              <option value="all">Semua status</option>
              <option value="unsent">Belum dikirim</option>
              <option value="sent">Sudah dikirim</option>
            </select>
            <Button onClick={() => openTemplate()} disabled={!loaded} className="ml-auto">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Template Pesan
              {settingsDirty && <span className="h-2 w-2 rounded-full bg-[#d97706]" title="Ada perubahan yang belum disimpan" />}
            </Button>
            <Button variant="danger" onClick={resetAllSentStatus} disabled={!loaded || sentCount === 0}>
              Reset Semua Status
            </Button>
            <Button onClick={load} disabled={loading}>
              {loading && <Spinner />}
              {loading ? "Memuat..." : "Muat Ulang"}
            </Button>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[#e5dfd3] bg-white">
            <table className={`w-full text-left text-sm transition-opacity ${loading && loaded ? "opacity-50" : ""}`} aria-busy={loading}>
              {loading && loaded && <LoadingCaption />}
              <thead className="bg-[#faf8f4] text-xs uppercase tracking-wider text-[#8a8374]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="w-44 px-4 py-3 font-medium">WhatsApp</th>
                  <th className="w-40 px-4 py-3 font-medium">Status</th>
                  <th className="w-[430px] px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efe9de] text-[#1f2a22]">
                {!loaded && <SkeletonRows columns={["w-36", "w-28", "w-24", "ml-auto w-80"]} />}
                {pagination.pageItems.map((guest) => (
                  <tr key={guest.id} className={templateOpen && previewGuest?.id === guest.id ? "bg-[#f5f1e8]" : "hover:bg-[#fcfbf8]"}>
                    <td className="px-4 py-3 font-medium [overflow-wrap:anywhere]">{guest.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#3d463f]">{guest.phone ? formatPhone(guest.phone) : <span className="text-[#b3ab9c]">Pilih saat kirim</span>}</td>
                    <td className="px-4 py-3">
                      {guest.sentAt ? (
                        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-medium text-[#1f6b3a]">
                            Terkirim · {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(guest.sentAt))}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSent(guest, false);
                            }}
                            title="Kembalikan ke Belum dikirim"
                            className="text-xs font-medium text-[#8a8374] underline-offset-4 hover:text-[#9b1c1c] hover:underline"
                          >
                            ↺ Reset
                          </button>
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#fbf3e3] px-2.5 py-0.5 text-xs font-medium text-[#8a5a0e]">Belum dikirim</span>
                      )}
                      <div className="mt-1.5">
                        {guest.attendance ? (
                          <span
                            title={guest.respondedAt ? formatDate(guest.respondedAt) : undefined}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              guest.attendance === "hadir" ? "bg-[#e6f4ea] text-[#1f6b3a]" : "bg-[#f3efe7] text-[#6f6858]"
                            }`}
                          >
                            {attendanceLabel(guest.attendance)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#b3ab9c]">Belum konfirmasi</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button onClick={() => openTemplate(guest)} title={`Pratinjau pesan untuk ${guest.name}`} aria-label={`Pratinjau pesan untuk ${guest.name}`} className="px-2 py-1.5 text-xs">
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Button>
                        <Button variant="whatsapp" onClick={() => sendWhatsApp(guest)} className="px-2 py-1.5 text-xs">
                          Kirim WA
                        </Button>
                        <CopyButton text={inviteLink(guest)} label="Salin Link" className="w-[82px] px-2 py-1.5 text-xs" />
                        <ShareMenu
                          message={() => renderMessage(settings.template, guest)}
                          onShared={() => !guest.sentAt && setSent(guest, true)}
                          className="w-[86px] px-2 py-1.5 text-xs"
                        />
                        <Button variant="danger" onClick={() => remove(guest)} className="px-2 py-1.5 text-xs">
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loaded && !loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-[#8a8374]">
                      {guests.length === 0 ? "Belum ada tamu. Tambahkan tamu di atas." : "Tidak ada tamu yang cocok."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {loaded && <Pagination {...pagination} />}
          </div>
        </div>
      </div>

      {templateOpen && (
        <TemplateDrawer
          template={settings.template}
          onTemplateChange={(template) => {
            setSettings((current) => ({ ...current, template }));
            setSettingsDirty(true);
          }}
          dirty={settingsDirty}
          saving={saving === "template"}
          onSave={saveSettings}
          onRestoreDefault={() => {
            setSettings((current) => ({ ...current, template: defaultTemplate }));
            setSettingsDirty(true);
          }}
          guests={guests}
          previewGuest={previewGuest}
          onPreviewGuest={setPreviewId}
          onSendWhatsApp={sendWhatsApp}
          onShared={(guest) => !guest.sentAt && setSent(guest, true)}
          onClose={closeTemplate}
        />
      )}
    </div>
  );
};

// An admin entry without a WhatsApp number is a group invitation (shared in a WhatsApp group), not a person
const isGroupInvite = (guest: Guest) => (guest.source ?? "admin") === "admin" && !guest.phone;

const sourceLabel = (guest: Guest, groupNames: Map<string, string>) => {
  if (guest.source === "self") {
    if (!guest.groupId) return "Link umum";
    const group = groupNames.get(guest.groupId);
    return group ? `Grup: ${group}` : "Grup (sudah dihapus)";
  }
  if (guest.source === "paper") {
    if (!guest.groupId) return "Undangan kertas";
    const group = groupNames.get(guest.groupId);
    return group ? `Undangan kertas · Grup: ${group}` : "Undangan kertas · Grup (sudah dihapus)";
  }
  return guest.source === "desk" ? "Ditambah di lokasi" : "Undangan pribadi";
};

// Everyone on the list in one table: personal and group invitations (whether sent) and their RSVP. Guests with a paper
// invitation (no link, e.g. the parents' guests) are added here, optionally under a group (existing or new); entries
// can be edited and deleted here; sending stays in the Kirim Undangan tab.
type GuestKind = "pribadi" | "grup" | "anggota" | "umum" | "lokasi" | "kertas";

interface GuestListRow {
  guest: Guest;
  kind: GuestKind;
  origin: string;
  attendance: Attendance | null;
  // RSVP stored on the guest (personal link), or read from a wish sent under their name (group / general link)
  rsvpFromWish: boolean;
  // Group invitations: how many guests are filed under it
  members?: { total: number };
}

const STATUS_FILTERS = [
  ["all", "Semua status"],
  ["hadir", "Konfirmasi hadir"],
  ["tidak_hadir", "Konfirmasi tidak hadir"],
  ["belum_konfirmasi", "Belum konfirmasi"],
  ["belum_dikirim", "Undangan belum dikirim"],
] as const;

const KIND_FILTERS = [
  ["all", "Semua asal"],
  ["pribadi", "Undangan pribadi"],
  ["grup", "Undangan grup"],
  ["kertas", "Undangan kertas"],
] as const;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const buildGuestList = (guests: Guest[], wishes: Wish[]): GuestListRow[] => {
  const groups = guests.filter(isGroupInvite);
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  // Newest first, so the first match is the latest answer
  const byNewest = [...wishes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return guests
    .map((guest): GuestListRow => {
      if (isGroupInvite(guest)) {
        const members = guests.filter((g) => g.groupId === guest.id);
        return {
          guest,
          kind: "grup",
          origin: "Undangan grup",
          attendance: null,
          rsvpFromWish: false,
          members: { total: members.length },
        };
      }
      const kind: GuestKind =
        guest.source === "self"
          ? guest.groupId
            ? "anggota"
            : "umum"
          : guest.source === "desk"
            ? "lokasi"
            : guest.source === "paper"
              ? "kertas"
              : "pribadi";
      let attendance = guest.attendance ?? null;
      let rsvpFromWish = false;
      if (!attendance && kind !== "pribadi") {
        // A wish under the same name, sent from this person's group link or the general link
        const wish = byNewest.find(
          (w) => w.attendance && sameName(w.name, guest.name) && (!w.guestId || w.guestId === guest.groupId || w.guestId === guest.id),
        );
        if (wish?.attendance) {
          attendance = wish.attendance;
          rsvpFromWish = true;
        }
      }
      return { guest, kind, origin: sourceLabel(guest, groupNames), attendance, rsvpFromWish };
    })
    .sort((a, b) => (b.guest.createdAt ?? "").localeCompare(a.guest.createdAt ?? ""));
};

const matchesStatus = (row: GuestListRow, status: (typeof STATUS_FILTERS)[number][0]) => {
  const person = row.kind !== "grup";
  switch (status) {
    case "all":
      return true;
    case "hadir":
    case "tidak_hadir":
      return row.attendance === status;
    case "belum_konfirmasi":
      return person && !row.attendance;
    case "belum_dikirim":
      return (row.kind === "pribadi" || row.kind === "grup") && !row.guest.sentAt;
  }
};

const GuestListTab: React.FC<{ onAuthError: () => void }> = ({ onAuthError }) => {
  const confirm = useConfirm();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const rows = useMemo(() => buildGuestList(guests, wishes), [guests, wishes]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number][0]>("all");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number][0]>("all");
  // Group invitations whose members are shown under them
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // Everyone filed under the group (paper invitations added to it), whatever the filters
  const membersOf = (groupId: string) => rows.filter((row) => row.kind !== "grup" && row.guest.groupId === groupId);
  // The add / edit window: a new paper-invitation guest, or the entry being edited
  const [form, setForm] = useState<{ mode: "add" } | { mode: "edit"; guest: Guest } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guestData, wishData] = await Promise.all([
        api<{ guests: Guest[] }>("/api/admin/guests"),
        api<{ wishes: Wish[] }>("/api/admin/wishes"),
      ]);
      setGuests(guestData.guests);
      setWishes(wishData.wishes);
      setError(null);
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError();
      else setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [onAuthError]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Numbers are stored as 62...; a search typed as 0812... finds them too
    const digits = q.replace(/\D/g, "").replace(/^0/, "62");
    const matchesQuery = (row: GuestListRow) =>
      !q ||
      row.guest.name.toLowerCase().includes(q) ||
      row.origin.toLowerCase().includes(q) ||
      (digits.length >= 3 && (row.guest.phone ?? "").includes(digits));
    return rows.filter((row) => (kind === "all" || row.kind === kind) && matchesStatus(row, status) && matchesQuery(row));
  }, [rows, query, kind, status]);
  const pagination = usePagination(visible);

  const remove = (row: GuestListRow) =>
    confirm({
      title: row.kind === "grup" ? "Hapus undangan grup?" : "Hapus tamu?",
      message:
        row.kind === "grup" ? (
          <>
            Undangan grup <span className="font-semibold text-[#1f2a22]">{row.guest.name}</span> akan dihapus dan link grupnya tidak
            terhubung lagi ke grup ini.
            {row.members && row.members.total > 0 ? ` ${row.members.total} anggotanya tetap ada di daftar.` : ""}
          </>
        ) : (
          <>
            <span className="font-semibold text-[#1f2a22]">{row.guest.name}</span> akan dihapus dari daftar.
            {row.kind === "pribadi" ? " Link undangan pribadinya tidak terhubung lagi ke daftar tamu." : ""}{" "}
            Ucapan yang sudah dikirim tetap ada.
          </>
        ),
      confirmLabel: row.kind === "grup" ? "Hapus Undangan" : "Hapus Tamu",
      busyLabel: "Menghapus...",
      action: async () => {
        try {
          await api(`/api/admin/guests?id=${encodeURIComponent(row.guest.id)}`, { method: "DELETE" });
          setGuests((prev) => prev.filter((g) => g.id !== row.guest.id));
        } catch (err) {
          if ((err as { status?: number }).status === 401) onAuthError();
          else setError((err as Error).message);
        }
      },
    });

  const people = rows.filter((row) => row.kind !== "grup");
  const invitationText = (row: GuestListRow) =>
    row.kind === "pribadi" || row.kind === "grup" ? (row.guest.sentAt ? `Terkirim ${formatDate(row.guest.sentAt)}` : "Belum dikirim") : "-";

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvRows = [
      ["Nama", "Asal", "WhatsApp", "Undangan", "Konfirmasi"],
      ...visible.map((row) => [
        row.guest.name,
        row.members ? `${row.origin} (${row.members.total} anggota)` : row.origin,
        row.guest.phone ? formatPhone(row.guest.phone) : "-",
        invitationText(row),
        row.attendance ? `${attendanceLabel(row.attendance)}${row.rsvpFromWish ? " (dari ucapan)" : ""}` : "-",
      ]),
    ];
    const blob = new Blob(["﻿" + csvRows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "daftar-tamu-annisa-rizki.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const selectClass = "rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]";

  // A table row; group members opened under their group invitation are indented
  const renderRow = (row: GuestListRow, nested = false) => (
    <tr key={row.guest.id} className={`align-top ${nested ? "bg-[#fbfaf6] hover:bg-[#f6f3ec]" : "hover:bg-[#fcfbf8]"}`}>
      <td className={`py-3 pr-4 font-medium [overflow-wrap:anywhere] ${nested ? "pl-10" : "pl-4"}`}>
        {nested && (
          <span aria-hidden="true" className="mr-1.5 text-[#b3ab9c]">
            ↳
          </span>
        )}
        {row.guest.name}
      </td>
      <td className="px-4 py-3 text-[#3d463f] [overflow-wrap:anywhere]">
        {row.origin}
        {row.members &&
          (row.members.total > 0 ? (
            <button
              type="button"
              onClick={() => toggleGroup(row.guest.id)}
              aria-expanded={openGroups.has(row.guest.id)}
              className="mt-0.5 block text-xs font-medium text-[#24412f] underline-offset-4 hover:underline"
            >
              {openGroups.has(row.guest.id) ? "Sembunyikan anggota ▴" : `Lihat ${row.members.total} anggota ▾`}
            </button>
          ) : (
            <div className="text-xs text-[#8a8374]">Belum ada anggota</div>
          ))}
      </td>
      <td className="px-4 py-3 text-[#3d463f]">{row.guest.phone ? formatPhone(row.guest.phone) : <span className="text-[#b3ab9c]">-</span>}</td>
      <td className="px-4 py-3">
        {row.kind === "pribadi" || row.kind === "grup" ? (
          row.guest.sentAt ? (
            <span className="text-xs text-[#1f6b3a]">Terkirim {formatDate(row.guest.sentAt)}</span>
          ) : (
            <span className="rounded-full bg-[#fff4e0] px-2.5 py-0.5 text-xs font-medium text-[#8a5a12]">Belum dikirim</span>
          )
        ) : (
          <span className="text-[#b3ab9c]">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.attendance ? (
          <>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                row.attendance === "hadir" ? "bg-[#e6f4ea] text-[#1f6b3a]" : "bg-[#f6eded] text-[#8a2a2a]"
              }`}
            >
              {attendanceLabel(row.attendance)}
            </span>
            {row.rsvpFromWish && <div className="mt-1 text-xs text-[#8a8374]">dari ucapan</div>}
          </>
        ) : (
          <span className="text-xs text-[#b3ab9c]">{row.kind === "grup" ? "-" : "Belum"}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1.5">
          <Button onClick={() => setForm({ mode: "edit", guest: row.guest })} className="px-2.5 py-1.5 text-xs">
            Edit
          </Button>
          <Button variant="danger" onClick={() => remove(row)} className="px-2.5 py-1.5 text-xs">
            Hapus
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Tamu" value={people.length} loading={!loaded} />
        <StatCard label="Undangan Grup" value={rows.length - people.length} loading={!loaded} tone="text-[#3d5a80]" />
        <StatCard label="Konfirmasi Hadir" value={people.filter((r) => r.attendance === "hadir").length} loading={!loaded} tone="text-[#1f8f4e]" />
        <StatCard label="Tidak Hadir" value={people.filter((r) => r.attendance === "tidak_hadir").length} loading={!loaded} tone="text-[#9b1c1c]" />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            pagination.setPage(1);
          }}
          placeholder="Cari nama, grup, atau nomor..."
          className="w-72 rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]"
        />
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            pagination.setPage(1);
          }}
          aria-label="Asal tamu"
          className={selectClass}
        >
          {KIND_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            pagination.setPage(1);
          }}
          aria-label="Status tamu"
          className={selectClass}
        >
          {STATUS_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="primary" onClick={() => setForm({ mode: "add" })} disabled={!loaded}>
            + Tambah Tamu
          </Button>
          <Button onClick={exportCsv} disabled={visible.length === 0}>
            Ekspor CSV
          </Button>
          <Button onClick={load} disabled={loading}>
            {loading && <Spinner />}
            {loading ? "Memuat..." : "Muat Ulang"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-[#fdf1f1] p-3 text-sm text-[#9b1c1c]">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-[#e5dfd3] bg-white">
        <table className={`w-full table-fixed text-left text-sm transition-opacity ${loading && loaded ? "opacity-50" : ""}`} aria-busy={loading}>
          {loading && loaded && <LoadingCaption />}
          <thead className="bg-[#faf8f4] text-xs uppercase tracking-wider text-[#8a8374]">
            <tr>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="w-52 px-4 py-3 font-medium">Asal</th>
              <th className="w-40 px-4 py-3 font-medium">WhatsApp</th>
              <th className="w-44 px-4 py-3 font-medium">Undangan</th>
              <th className="w-40 px-4 py-3 font-medium">Konfirmasi</th>
              <th className="w-36 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#efe9de] text-[#1f2a22]">
            {!loaded && <SkeletonRows columns={["w-36", "w-28", "w-24", "w-24", "w-16", "ml-auto w-24"]} />}
            {pagination.pageItems.map((row) => (
              <React.Fragment key={row.guest.id}>
                {renderRow(row)}
                {openGroups.has(row.guest.id) && membersOf(row.guest.id).map((member) => renderRow(member, true))}
              </React.Fragment>
            ))}
            {loaded && !loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[#8a8374]">
                  {rows.length === 0 ? "Belum ada tamu." : "Tidak ada tamu yang cocok."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loaded && <Pagination {...pagination} />}
      </div>

      {form && (
        <GuestFormModal
          editing={form.mode === "edit" ? form.guest : null}
          guests={guests}
          onSaved={async () => {
            await load();
            // A new guest is on top of the first page
            if (form.mode === "add") pagination.setPage(1);
          }}
          onClose={() => setForm(null)}
          onAuthError={onAuthError}
        />
      )}
    </div>
  );
};

const NEW_GROUP = "__new__";

// Adds a paper-invitation guest (Enter saves and keeps the window open for the next one, with the same group), or
// edits an entry: a person's name and, unless invited personally, their group; a group invitation's name
const GuestFormModal: React.FC<{
  editing: Guest | null;
  guests: Guest[];
  onSaved: () => Promise<void>;
  onClose: () => void;
  onAuthError: () => void;
}> = ({ editing, guests, onSaved, onClose, onAuthError }) => {
  const isGroup = !!editing && isGroupInvite(editing);
  // Personal invitations keep their own link: no group
  const canPickGroup = !editing || (editing.source ?? "admin") !== "admin";
  const groups = useMemo(() => guests.filter(isGroupInvite).sort((a, b) => a.name.localeCompare(b.name, "id")), [guests]);
  const [name, setName] = useState(editing?.name ?? "");
  const [groupChoice, setGroupChoice] = useState(editing?.groupId && groups.some((g) => g.id === editing.groupId) ? editing.groupId : "");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const creatingGroup = canPickGroup && groupChoice === NEW_GROUP;
  const valid = name.trim().length >= 2 && (!creatingGroup || newGroup.trim().length >= 2);

  const save = async (addAnother: boolean) => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const group = canPickGroup && !isGroup ? (creatingGroup ? { newGroup: newGroup.trim() } : { groupId: groupChoice || null }) : {};
    try {
      if (editing) {
        await api("/api/admin/guests", { method: "PATCH", body: JSON.stringify({ id: editing.id, name: name.trim(), ...group }) });
      } else {
        const { guest } = await api<{ guest: Guest }>("/api/admin/guests", {
          method: "POST",
          body: JSON.stringify({ person: { name: name.trim(), ...group } }),
        });
        // The next guest goes into the same group, also when it was just created
        if (creatingGroup && guest.groupId) {
          setGroupChoice(guest.groupId);
          setNewGroup("");
        }
        setAdded((prev) => [guest.name, ...prev]);
      }
      await onSaved();
      if (addAnother) {
        setName("");
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      if ((err as { status?: number }).status === 401) onAuthError();
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = "mt-1.5 w-full rounded-lg border border-[#d9d2c5] bg-white px-3 py-2 text-sm outline-none focus:border-[#24412f]";
  const title = editing ? (isGroup ? "Edit Grup" : "Edit Tamu") : "Tambah Tamu Undangan Kertas";

  return (
    <div className="admin-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1f2a22]/45 backdrop-blur-[2px]" onClick={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-form-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save(!editing);
        }}
        className="admin-modal-card w-[460px] rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(31,42,34,0.25)]"
      >
        <h2 id="guest-form-title" className="text-base font-semibold text-[#1f2a22]">
          {title}
        </h2>
        {!editing && (
          <p className="mt-1 text-sm leading-relaxed text-[#5c645d]">
            Untuk tamu yang hanya menerima undangan kertas (misalnya tamu orang tua), supaya tetap tercatat di daftar tamu.
          </p>
        )}

        <label className="mt-5 block text-sm font-medium text-[#1f2a22]">
          {isGroup ? "Nama grup" : "Nama tamu"}
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={isGroup ? "Contoh: Rekan Kantor Papa" : "Contoh: Bapak Ahmad & Keluarga"}
            className={fieldClass}
          />
        </label>

        {canPickGroup && !isGroup && (
          <label className="mt-4 block text-sm font-medium text-[#1f2a22]">
            Grup <span className="font-normal text-[#8a8374]">(opsional)</span>
            <select value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)} className={fieldClass}>
              <option value="">Tanpa grup</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
              <option value={NEW_GROUP}>+ Buat grup baru…</option>
            </select>
          </label>
        )}
        {creatingGroup && (
          <label className="mt-3 block text-sm font-medium text-[#1f2a22]">
            Nama grup baru
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              maxLength={80}
              placeholder="Contoh: Tamu Mama, Keluarga Bandung"
              autoFocus
              className={fieldClass}
            />
          </label>
        )}

        {error && <p className="mt-4 whitespace-pre-line rounded-lg bg-[#fdf1f1] p-3 text-sm text-[#9b1c1c]">{error}</p>}
        {added.length > 0 && (
          <p className="mt-4 rounded-lg bg-[#eef6f0] p-3 text-sm text-[#1f6b3a] [overflow-wrap:anywhere]">
            ✓ Ditambahkan ({added.length}): {added.slice(0, 5).join(", ")}
            {added.length > 5 ? ", …" : ""}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy}>
            {added.length > 0 ? "Selesai" : "Batal"}
          </Button>
          {editing ? (
            <Button type="submit" variant="primary" disabled={!valid || busy}>
              {busy && <Spinner />}
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          ) : (
            <>
              <Button type="button" onClick={() => save(false)} disabled={!valid || busy}>
                Simpan &amp; Tutup
              </Button>
              <Button type="submit" variant="primary" disabled={!valid || busy}>
                {busy && <Spinner />}
                {busy ? "Menyimpan..." : "Simpan & Tambah Lagi"}
              </Button>
            </>
          )}
        </div>
        {!editing && (
          <p className="mt-3 text-right text-xs text-[#8a8374]">
            Tekan Enter untuk simpan &amp; tambah lagi; grup yang dipilih tetap terpakai untuk tamu berikutnya.
          </p>
        )}
      </form>
    </div>
  );
};

interface Session {
  authenticated: boolean;
  configured: boolean;
  storage: "postgres" | "file" | "missing";
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("wishes");

  const checkSession = useCallback(async () => {
    try {
      setSession(await api<Session>("/api/admin/session"));
      setSessionError(null);
    } catch (err) {
      setSessionError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(checkSession, 0);
    return () => clearTimeout(initial);
  }, [checkSession]);

  const handleAuthError = useCallback(() => setSession((s) => (s ? { ...s, authenticated: false } : s)), []);

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST" });
    setSession((s) => (s ? { ...s, authenticated: false } : s));
  };

  if (sessionError && !session) {
    return (
      <div className="admin-root flex min-h-screen items-center justify-center bg-[#f6f3ee] font-sans text-[#1f2a22]">
        <div className="w-[420px] rounded-2xl border border-[#f0c9c9] bg-white p-8 text-sm shadow-sm">
          <p className="font-semibold text-[#9b1c1c]">Server admin tidak dapat dihubungi</p>
          <p className="mt-2 text-[#3d463f]">{sessionError}</p>
          <Button className="mt-5" onClick={checkSession}>
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="admin-root flex min-h-screen items-center justify-center bg-[#f6f3ee] font-sans text-[#5c6158]" role="status">
        <span className="inline-flex items-center gap-3 text-sm">
          <Spinner className="h-5 w-5 text-[#24412f]" /> Memuat admin...
        </span>
      </div>
    );
  }
  if (!session.authenticated) return <LoginScreen configured={session.configured} onLoggedIn={checkSession} />;

  return (
    <div className="admin-root min-h-screen min-w-[1100px] bg-[#f6f3ee] font-sans text-[#1f2a22]">
      <header className="border-b border-[#e5dfd3] bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-8 py-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a8374]">Admin Undangan</div>
            <div className="text-lg font-semibold">Annisa &amp; Rizki</div>
          </div>
          <nav className="flex gap-1">
            {(
              [
                ["wishes", "Ucapan"],
                ["guests", "Daftar Tamu"],
                ["invites", "Kirim Undangan"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === value ? "bg-[#24412f] text-white" : "text-[#3d463f] hover:bg-[#f3efe7]"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" target="_blank" className="text-sm text-[#24412f] underline-offset-4 hover:underline">
              Lihat undangan ↗
            </Link>
            <Button onClick={logout}>Keluar</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-8 py-8">
        {session.storage === "missing" && (
          <div className="mb-6 rounded-xl border border-[#f0c9c9] bg-[#fdf1f1] p-4 text-sm text-[#9b1c1c]">
            <strong>Database belum terhubung.</strong> Ucapan, daftar tamu, dan template tidak bisa disimpan. Di Vercel buka
            Storage → Create Database → Neon (Postgres), hubungkan ke project ini, lalu Redeploy.
          </div>
        )}
        <ConfirmProvider>
          {tab === "wishes" ? (
            <WishesTab onAuthError={handleAuthError} />
          ) : tab === "guests" ? (
            <GuestListTab onAuthError={handleAuthError} />
          ) : (
            <InvitesTab onAuthError={handleAuthError} />
          )}
        </ConfirmProvider>
      </main>
    </div>
  );
}
