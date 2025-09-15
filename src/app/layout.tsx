import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./styles/custom.css";
import ConnectionManager from "@/components/ConnectionManager";
import DebugOverlay from "@/components/DebugOverlay";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Study Fetch - PDF Chat",
  description: "Chat with your PDFs using GPT-4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plusJakartaSans.variable} font-sans antialiased`}>
        <ConnectionManager>
          {children}
          <DebugOverlay />
        </ConnectionManager>
      </body>
    </html>
  );
}
