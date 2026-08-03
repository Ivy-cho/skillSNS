import type { Metadata } from "next";
import { IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const plexSansKR = localFont({
  variable: "--font-plex-sans-kr",
  src: "../fonts/IBMPlexSansKR-Regular.woff2",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "토마토",
  description: "누구나 자신의 노하우를 스킬로 만들고 공유하는 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${plexSerif.variable} ${plexMono.variable} ${plexSansKR.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">{children}</body>
    </html>
  );
}
