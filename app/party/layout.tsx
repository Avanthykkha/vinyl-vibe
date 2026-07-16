import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private Listening Party",
  robots: { index: false, follow: false },
};

export default function PartyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
