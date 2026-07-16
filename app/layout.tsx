import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://vinyl-by-avi.netlify.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vinyl — Discover, Play & Listen Together",
    template: "%s | Vinyl",
  },
  description:
    "A vinyl-inspired music app for discovering songs, building playlists, and listening together with friends in private party rooms.",
  applicationName: "Vinyl",
  keywords: [
    "Vinyl music app",
    "music discovery",
    "shared listening party",
    "music playlists",
    "vinyl player",
  ],
  authors: [{ name: "Vinyl" }],
  creator: "Vinyl",
  publisher: "Vinyl",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Vinyl",
    title: "Vinyl — Discover, Play & Listen Together",
    description:
      "Discover songs, build your collection, and host private listening parties with friends.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vinyl — Discover, Play & Listen Together",
    description:
      "Discover songs, build your collection, and host private listening parties with friends.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="fixed bottom-4 right-5 z-[999] rounded-full border border-[#f2bbc7]/55 bg-[#8d4657]/90 px-5 py-2.5 text-sm font-semibold tracking-[0.06em] text-[#fff8f1] shadow-[0_12px_35px_rgba(0,0,0,.35)] backdrop-blur-xl sm:bottom-5 sm:right-7">
          Built by Avi <span className="text-[#ffd2dc]">♡</span>
        </footer>
      </body>
    </html>
  );
}
