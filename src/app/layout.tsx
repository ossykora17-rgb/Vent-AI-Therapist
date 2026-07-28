import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["700", "900"],
});

export const metadata: Metadata = {
  title: {
    default: "Vent — Say it out loud.",
    template: "%s · Vent",
  },
  description:
    "A private, judgement-free place to say what you can't say anywhere else. Encrypted, yours alone, available at 3am.",
  applicationName: "Vent",
  openGraph: {
    title: "Vent — Say it out loud.",
    description:
      "A private, judgement-free place to say what you can't say anywhere else.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:border-3 focus:border-ink focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:uppercase"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
