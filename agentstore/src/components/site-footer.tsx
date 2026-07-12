import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

const LINKS = [
  { label: "Explore agents", href: "/explore", external: false },
  { label: "Publish", href: "/#publish", external: false },
  { label: "gethouston.ai", href: "https://gethouston.ai", external: true },
  { label: "Terms", href: "https://gethouston.ai/terms", external: true },
  { label: "Privacy", href: "https://gethouston.ai/privacy", external: true },
] as const;

/** Global footer with brand line and the canonical off-site links. */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-display text-sm font-semibold">
            {siteConfig.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A catalog of no-code AI agents for Houston.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
        >
          {LINKS.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
