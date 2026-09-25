import { PRODUCT_LINE, PRODUCT_TITLE } from "@/lib/vent/voice";
import { CRISIS_LINES } from "@/lib/vent/intent";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { ServiceWorkerRegistrar } from "@/components/sw-register";
import "./globals.css";

/**
 * Inter, as a variable font.
 *
 * Dropping the weight array is what makes it variable rather than two static
 * cuts: the whole axis ships, so 450 and 550 exist and text can be nudged
 * without jumping a step. It is also one file instead of several.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Fraunces for display, in place of Playfair.
 *
 * Playfair is the default serif of every wellness template on the internet,
 * and a room that looks like every other room is not a room anybody remembers.
 * Fraunces is variable with an optical-size axis, so it grows warmer and
 * softer as it gets larger rather than just scaling — which is exactly what a
 * heading in a quiet room should do. SOFT rounds the terminals; WONK lets the
 * italics keep their strangeness instead of being sanded flat.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: {
    default: PRODUCT_TITLE,
    template: `%s · ${PRODUCT_TITLE.split(" — ")[0]}`,
  },
  /*
    This read "Autonomous AI therapy grounded in real time. Vent, track mood,
    breathe, journal", under a default title ending "Calm AI Therapy Grounded
    in Reality" — the first sentence a stranger meets in a search result or a
    shared link. Every screen here says it is not therapy, and the VENT spec
    opens on "You are not a therapist"; and the room hands nobody a breathing
    exercise or a journal since the no-errands spec. A description is a claim
    like any other sentence, and it is the one read before anybody arrives.
  */
  description:
    `${PRODUCT_LINE} An AI, not a therapist: a private room to vent, and six-seat peer circles. Nigeria support ${CRISIS_LINES.nigeria}.`,
  applicationName: PRODUCT_TITLE.split(" — ")[0],
  manifest: "/manifest.webmanifest",
  // Declared explicitly rather than via app/icon.svg: the file-based
  // convention claims /icon.svg and collides with the static file the
  // manifest already points at, which 500s that route in dev.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  openGraph: {
    title: PRODUCT_TITLE,
    description: `${PRODUCT_LINE} Calm AI support, grounded in reality.`,
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
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-card focus:border focus:border-line/10 focus:bg-card focus:px-3 focus:py-2 focus:text-body focus:font-bold"
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
