import React from "react";
import { MARKUP, ROOT_CLASS } from "./markup.generated";
import { InvitationRuntime } from "./InvitationRuntime";

// Markup template (hasil render Canva) dirender di server apa adanya; InvitationRuntime mengisi datanya di browser.
// ROOT_CLASS membawa variabel tema Canva yang aslinya ada di <html>.
export const InvitationPage: React.FC = () => (
  <>
    {/* Style template hanya untuk halaman undangan (tidak boleh ikut ke /admin dan /checkin), jadi tidak di-import global */}
    {/* eslint-disable-next-line @next/next/no-css-tags */}
    <link rel="stylesheet" href="/css/template.css" precedence="default" />
    {/* eslint-disable-next-line @next/next/no-css-tags */}
    <link rel="stylesheet" href="/css/style.css" precedence="high" />
    <div className={`invitation-root ${ROOT_CLASS}`} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MARKUP }} />
    <audio id="bgm" loop preload="none" />
    <InvitationRuntime />
  </>
);
