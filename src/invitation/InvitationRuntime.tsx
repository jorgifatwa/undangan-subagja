"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToastProvider, useToast } from "@/components/Toast";
import { RsvpWidget } from "@/components/RsvpWidget";
import { GalleryLightbox } from "@/components/GalleryLightbox";
import { WEDDING } from "./config";
import { googleCalendarUrl } from "@/lib/weddingEvent";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Menjalankan runtime undangan (src/invitation/main.js) di atas markup template yang dirender server,
// lalu memasang widget RSVP (React) ke slot RSVP di kartu renda dan lightbox galeri.
const Runtime: React.FC = () => {
  const [rsvpEl, setRsvpEl] = useState<HTMLElement | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const root = document.getElementById("phone");
    if (!root || root.dataset.ready) return; // sekali saja (StrictMode menjalankan efek dua kali di dev)
    root.dataset.ready = "1";
    import("./main").then(({ initInvitation }) => initInvitation(WEDDING, { mountRsvp: setRsvpEl, showToast, openGallery: setPhotoIndex, calendarUrl: googleCalendarUrl() }));
  }, [showToast]);

  const last = WEDDING.events[WEDDING.events.length - 1];
  const [y, m, d] = last.date.split("-").map(Number);
  const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dateText = `${HARI[new Date(y, m - 1, d).getDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
  const title = `${WEDDING.bride.nick} & ${WEDDING.groom.nick}`;
  const photos = WEDDING.photos.gallery.filter(Boolean);

  return (
    <>
      {rsvpEl && createPortal(<RsvpWidget title={title} dateText={dateText} />, rsvpEl)}
      {photoIndex !== null && photos.length > 0 && (
        <GalleryLightbox photos={photos} index={photoIndex} onChange={setPhotoIndex} onClose={() => setPhotoIndex(null)} />
      )}
    </>
  );
};

export const InvitationRuntime: React.FC = () => (
  <ToastProvider>
    <Runtime />
  </ToastProvider>
);
