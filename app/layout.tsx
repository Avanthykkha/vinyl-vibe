import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://vinyl-vibe-six.vercel.app";

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
      <body>{children}</body>
    </html>
  );
}
