import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Louella Bakery",
  description:
    "Neighborhood panaderya — pandesal at dawn, merienda breads in the afternoon, cakes for the table.",
};

/**
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` resolve to real
 * numbers instead of 0. Without it a bottom sheet renders under the iPhone home
 * indicator. Width and initial-scale match Next's default; they are repeated
 * because declaring this export replaces the default rather than extending it.
 *
 * Deliberately no `maximumScale` / `userScalable: false`: suppressing zoom is
 * the usual "fix" for the iOS input zoom and it breaks WCAG 1.4.4. The real fix
 * is a 16px input font — see src/components/ui/input.tsx.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
