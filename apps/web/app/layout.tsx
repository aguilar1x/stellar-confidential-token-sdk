import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

import { Nav } from "@/components/nav";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

/**
 * The utility face is doing real work here, not captioning. Half this site is
 * 64-character hex strings a reader is asked to compare, so the mono needs
 * unambiguous 0/O and evenly-weighted hex glyphs. JetBrains Mono is chosen for
 * exactly that.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-hex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Confidential Tokens — the client layer",
    template: "%s · stellar-confidential-token-sdk",
  },
  description:
    "An amount nobody can read, a total everybody can audit, and a client that refuses an archive that lies about either.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
