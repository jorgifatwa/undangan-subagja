"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Lightbox galeri, sama dengan GallerySection di undangan-jorgi-estetik: coverflow (foto aktif di depan,
// tetangganya miring di kiri/kanan), geser kiri/kanan di HP, tombol ‹ ›, keyboard ← → Esc, penghitung foto.

const COVERFLOW_SIDE = 2;
const SWIPE_PX = 45;

// Jarak bertanda terpendek dari foto aktif, melingkar (foto terakhir ada di kiri foto pertama)
const coverflowOffset = (idx: number, active: number, count: number) => {
  const half = Math.floor(count / 2);
  return ((idx - active + count + half) % count) - half;
};

const arrowButtonStyle: React.CSSProperties = {
  position: "absolute",
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  color: "#ffffff",
  fontSize: "22px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  zIndex: 10001,
};

export const GalleryLightbox: React.FC<{ photos: string[]; index: number; onChange: (i: number) => void; onClose: () => void }> = ({
  photos,
  index,
  onChange,
  onClose,
}) => {
  const count = photos.length;
  const prev = useCallback(() => onChange(index > 0 ? index - 1 : count - 1), [index, count, onChange]);
  const next = useCallback(() => onChange(index < count - 1 ? index + 1 : 0), [index, count, onChange]);

  // Geser horizontal mengganti foto; klik yang menutup gesekan tidak boleh menutup lightbox
  const swipe = useRef({ x: 0, moved: false });
  const close = () => {
    if (!swipe.current.moved) onClose();
  };
  const onTouchStart = (e: React.TouchEvent) => {
    swipe.current = { x: e.touches[0].clientX, moved: false };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipe.current.x;
    if (Math.abs(dx) < SWIPE_PX) return;
    swipe.current.moved = true;
    setTimeout(() => (swipe.current.moved = false), 400);
    if (dx > 0) prev();
    else next();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Galeri foto"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup Galeri"
        style={{ ...arrowButtonStyle, top: "20px", right: "20px", width: "40px", height: "40px", backgroundColor: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.3)", fontSize: "20px" }}
      >
        ✕
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Foto Sebelumnya" style={{ ...arrowButtonStyle, left: "14px" }}>
        ‹
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Foto Selanjutnya" style={{ ...arrowButtonStyle, right: "14px" }}>
        ›
      </button>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ position: "absolute", inset: 0, perspective: "1100px", overflow: "hidden" }}>
        {photos.map((src, idx) => {
          const offset = coverflowOffset(idx, index, count);
          const distance = Math.min(Math.abs(offset), COVERFLOW_SIDE + 1);
          const side = Math.sign(offset);
          return (
            <div
              key={src + idx}
              onClick={(e) => {
                e.stopPropagation();
                if (offset !== 0) onChange(idx);
              }}
              aria-hidden={offset !== 0}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform:
                  offset === 0
                    ? "translate(-50%, -50%)"
                    : `translate(-50%, -50%) translateX(${side * (34 + distance * 30)}%) translateZ(${-120 - distance * 110}px) rotateY(${-side * 45}deg)`,
                opacity: distance > COVERFLOW_SIDE ? 0 : [1, 0.6, 0.28][distance],
                zIndex: 10 - distance,
                transition: "transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.55s ease",
                pointerEvents: distance > COVERFLOW_SIDE ? "none" : "auto",
                cursor: offset === 0 ? "default" : "pointer",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Foto galeri ${idx + 1}`}
                draggable={false}
                style={{ display: "block", maxWidth: "70vw", maxHeight: "72vh", objectFit: "contain", borderRadius: "6px", boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)" }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", bottom: "24px", color: "rgba(255, 255, 255, 0.8)", fontSize: "13px", fontFamily: "YAFdJhX-538_0, 'Cormorant Garamond', serif", letterSpacing: "1px", zIndex: 10001 }}>
        {index + 1} / {count}
      </div>
    </div>,
    document.body,
  );
};
