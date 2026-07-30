import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: '--font-poppins',
});

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
    <html lang="en" className={`h-full ${poppins.className}`}>
      <body className="h-full bg-white antialiased">
        <div className="lg:max-w-[640px] lg:mx-auto lg:relative lg:h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
