import React from "react";
import { MARKUP_URL, ROOT_CLASS } from "./markup.generated";
import { InvitationRuntime } from "./InvitationRuntime";

// Markup template (hasil render Canva, ~250 KB) tidak dirender di HTML halaman: InvitationRuntime memuatnya dari
// MARKUP_URL di browser lalu mengisi datanya. HTML halaman jadi kecil, sehingga pratinjau link WhatsApp/Facebook
// terbaca penuh. ROOT_CLASS membawa variabel tema Canva yang aslinya ada di <html>.
export const InvitationPage: React.FC = () => (
  <>
    {/* Style template hanya untuk halaman undangan (tidak boleh ikut ke /admin), jadi tidak di-import global */}
    {/* eslint-disable-next-line @next/next/no-css-tags */}
    <link rel="stylesheet" href="/css/template.css" precedence="default" />
    {/* eslint-disable-next-line @next/next/no-css-tags */}
    <link rel="stylesheet" href="/css/style.css" precedence="high" />
    <link rel="preload" href={MARKUP_URL} as="fetch" crossOrigin="anonymous" />
    <div id="invitation-root" className={`invitation-root ${ROOT_CLASS}`} suppressHydrationWarning />
    <audio id="bgm" loop preload="none" />
    <InvitationRuntime markupUrl={MARKUP_URL} />
  </>
);
