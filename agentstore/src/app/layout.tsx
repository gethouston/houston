import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SpaceBackground } from "@/components/space-background";
import { SessionProvider } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";
import "./space.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  // summary_large_image: share cards come from the opengraph-image file
  // convention (a default store card here, a per-agent card under /a/[slug]).
  twitter: {
    card: "summary_large_image",
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
    <html lang="en" data-theme="dark">
      <head>
        {/* Typography matches gethouston.ai: General Sans carries display
            headings + the wordmark (--font-display in globals.css); body copy
            is the system stack, so no body webfont is shipped at all. */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap"
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
