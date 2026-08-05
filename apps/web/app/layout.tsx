import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Don't trust your indexer. Verify it.",
  description:
    "One account's history, served by four archives. Three lie. The same confidential-token client reads all four — and believes one.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
