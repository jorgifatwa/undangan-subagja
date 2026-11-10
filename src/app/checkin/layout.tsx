import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Penerima Tamu · Annisa & Rizki",
  robots: { index: false, follow: false },
};

// The desk page is used on phones held by the committee: light bars, no zoom on the PIN / search fields
export const viewport: Viewport = {
  themeColor: "#f6f3ee",
  maximumScale: 1,
};

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
