import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { WEBFONT_CSS_URL } from "@/lib/styleTokens";

/* Display + body pairing. pagefly.io's exact typeface could not be confirmed
   (the site rate-limited every fetch), so these are the fallbacks the brief
   names. Swapping in PageFly's real font is a change to these two calls only —
   the `--pf-font-*` variable names are what the token layer consumes. */
const display = Plus_Jakarta_Sans({
  variable: "--pf-font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const body = Inter({
  variable: "--pf-font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PageFly Design — see your store as pages, before you build them",
  description:
    "Describe your store and get a visual mockup of every page you need.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* suppressHydrationWarning on html and body only.
       Browser extensions stamp attributes onto these two elements before React
       loads — Google Tag Assistant adds `data-tag-assistant-prod-present`, for
       instance — and React reports every one as a hydration mismatch. The
       warnings are noise that buries real mismatches, and suppression here does
       not extend to any element we actually render. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable}`}
    >
      {/* Tailwind Preflight is not imported, so the host document gets its
          margin reset inline rather than via a global stylesheet rule. When
          this feature is embedded into pagefly.io only the `.pfd-root` tree
          ships — this file does not. */}
      <head>
        {/* The mockup families, loaded by their real names.
            next/font above covers the app's own chrome through CSS variables, but
            the mockups name their families literally — and next/font's faces have
            hashed names, so a literal "Inter" never matched one. Loading them here
            by name is what makes a mockup show the font it asks for, and the same
            stylesheet is referenced by every exported page so the imported result
            matches. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={WEBFONT_CSS_URL} />
      </head>
      <body suppressHydrationWarning style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
