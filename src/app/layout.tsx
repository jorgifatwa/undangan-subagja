import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "The Wedding of Annisa & Rizki";
const DESCRIPTION = "Minggu, 13 Desember 2026 · Masjid Darushudur. Kami mengundang Anda untuk hadir dan memberikan doa restu.";

// Link previews (WhatsApp, Instagram, ...) need absolute image URLs. NEXT_PUBLIC_SITE_URL sets the public address
// (e.g. a custom domain); on Vercel the production domain is used automatically. The share image itself is
// app/opengraph-image.jpg.
// Accepts values with or without a scheme ("example.com" or "https://example.com"); invalid values are ignored.
const toUrl = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }
};

const siteUrl = toUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? toUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Annisa & Rizki",
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Draw under the notch / home indicator and tint Safari's bars to match the invitation
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#060e0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-[#0a140e] text-[#f5efe6] selection:bg-[#800020] selection:text-white overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
