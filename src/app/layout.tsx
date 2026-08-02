import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { ServiceWorkerRegistrar } from "@/components/sw-register";
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
    default: "Mind Weave Vent — Truth Anchor — Calm AI Therapy Grounded in Reality",
    template: "%s · Mind Weave Vent",
  },
  description:
    "Autonomous AI therapy grounded in real time. Vent, track mood, breathe, journal. Light and dark mode. Nigeria support 0806 210 6493.",
  applicationName: "Mind Weave Vent",
  manifest: "/manifest.webmanifest",
  // Declared explicitly rather than via app/icon.svg: the file-based
  // convention claims /icon.svg and collides with the static file the
  // manifest already points at, which 500s that route in dev.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  openGraph: {
    title: "Mind Weave Vent — Truth Anchor",
    description: "Carve your truth. Calm AI support, grounded in reality.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FEFCF8" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-card focus:border focus:border-line/10 focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-bold"
        >
          Skip to content
        </a>
        <ToastProvider>
          <ServiceWorkerRegistrar />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
