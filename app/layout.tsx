import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qraving",
  description: "QR code-based shared cart ordering",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-white antialiased">{children}</body>
    </html>
  );
}
