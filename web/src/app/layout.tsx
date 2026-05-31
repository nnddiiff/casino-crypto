import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://limbo-casino-five.vercel.app";
const SITE_DESC =
  "Доказуемо честное казино Limbo на Base Sepolia: случайность от Pyth Entropy, " +
  "преимущество казино и каждая ставка проверяемы on-chain. Вход по email, без газа.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LIMBO — честное on-chain казино на Base Sepolia",
  description: SITE_DESC,
  applicationName: "LIMBO",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "LIMBO",
    title: "LIMBO — честное on-chain казино",
    description: SITE_DESC,
    locale: "ru_RU",
  },
  twitter: {
    card: "summary",
    title: "LIMBO — честное on-chain казино",
    description: SITE_DESC,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15171d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Единственный h1 страницы (для SEO/скринридеров): шапка использует span, витрина — h2. */}
        <h1 className="sr-only">
          LIMBO — доказуемо честное on-chain казино на Base Sepolia
        </h1>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
