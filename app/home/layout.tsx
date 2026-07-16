import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Music Home",
  robots: { index: false, follow: false },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
