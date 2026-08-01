const links = [
  { label: "Get Houston", href: "https://gethouston.ai" },
  { label: "Terms", href: "https://gethouston.ai/terms" },
  { label: "Privacy", href: "https://gethouston.ai/privacy" },
] as const;

/** Quiet global footer, mounted once by the root layout. */
export function SiteFooter() {
  return (
    <footer className="w-full">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="font-medium text-ink">Agent Store</span>
          <span className="text-ink-muted">© Houston</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
