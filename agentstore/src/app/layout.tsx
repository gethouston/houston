import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SpaceBackground } from "@/components/space-background";
import { SessionProvider } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";
import "./space.css";

// Inter carries body text; Space Grotesk carries display headings. Exposed as
// CSS variables consumed by --font-sans / --font-display in globals.css.
// General Sans (the brand wordmark face, matching gethouston.ai) loads from
// fontshare in <head> below — it is used only by the header logo.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  // No og:image in v1 by design: agents have no branded share art yet, and a
  // generic placeholder card reads worse than a clean text preview. Revisit when
  // per-agent OG images ship.
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The store ships the gethouston.ai space theme only — data-theme is
    // pinned to dark (no toggle, no OS preference): the Milky Way background
    // is inherently dark, and the app dark tokens are designed for it.
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col pt-[65px]">
        <SpaceBackground />
        <SessionProvider>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
