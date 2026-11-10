"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToastProvider, useToast } from "@/components/Toast";
import { RsvpWidget } from "@/components/RsvpWidget";
import { WEDDING } from "./config";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Menjalankan runtime undangan (src/invitation/main.js) di atas markup template yang dirender server,
// lalu memasang widget RSVP (React) ke slot RSVP di kartu renda.
const Runtime: React.FC = () => {
  const [rsvpEl, setRsvpEl] = useState<HTMLElement | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const root = document.getElementById("phone");
    if (!root || root.dataset.ready) return; // sekali saja (StrictMode menjalankan efek dua kali di dev)
    root.dataset.ready = "1";
    import("./main").then(({ initInvitation }) => initInvitation(WEDDING, { mountRsvp: setRsvpEl, showToast }));
  }, [showToast]);

  const last = WEDDING.events[WEDDING.events.length - 1];
  const [y, m, d] = last.date.split("-").map(Number);
  const dateText = `${d} ${BULAN[m - 1]} ${y}`;
  const title = `${WEDDING.bride.nick} & ${WEDDING.groom.nick}`.toLowerCase();

  return rsvpEl ? createPortal(<RsvpWidget title={title} dateText={dateText} />, rsvpEl) : null;
};

export const InvitationRuntime: React.FC = () => (
  <ToastProvider>
    <Runtime />
  </ToastProvider>
);
