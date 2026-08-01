import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SessionProvider } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const themeScript = `
(() => {
  const stored = localStorage.getItem("houston-store-theme");
  const theme = stored === "light" || stored === "dark"
    ? stored
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
})();
`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The fixed, constant script must run before paint to prevent a
            light/dark flash; it contains no user-provided content. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant pre-paint theme bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <SessionProvider>
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
