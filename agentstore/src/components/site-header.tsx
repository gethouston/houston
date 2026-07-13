"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SearchForm } from "./search-form";
import { UserMenu } from "./user-menu";

/**
 * Store-first top bar (the mature-marketplace pattern: the store is a
 * destination, not a chapter of the marketing site). Lockup → store home,
 * persistent catalog search in the middle, store actions + the Download
 * funnel on the right. gethouston.ai remains one hop away via the Download
 * pill and the footer. Same space chrome as the landing nav: transparent
 * over the top of the page, near-opaque dark once scrolled, never blurred.
 */

const STORE_LINKS = [
  { label: "Explore", href: "/explore" },
  { label: "Publish", href: "/#publish" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 10);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 flex h-[65px] items-center gap-4 px-5 transition-colors duration-300 sm:px-8 ${
          scrolled
            ? "border-b border-white/10 bg-[rgba(11,12,19,0.94)]"
            : "bg-transparent"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-[22px] font-medium tracking-tight text-white">
            Houston
          </span>
          <span className="hidden text-sm font-medium text-white/60 sm:inline">
            Agent Store
          </span>
        </Link>

        <div className="mx-auto hidden w-full max-w-md md:block">
          <SearchForm placeholder="Search agents" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4 md:ml-0">
          {STORE_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="hidden text-sm text-white/70 transition-colors hover:text-white sm:inline"
            >
              {item.label}
            </Link>
          ))}
          <UserMenu />
          <a
            href="https://gethouston.ai/#download"
            className="hidden h-9 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-[#0d0d0d] transition-colors hover:bg-white/85 sm:inline-flex"
          >
            Download Houston
          </a>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="site-nav-dropdown"
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-5"
              aria-hidden="true"
              role="presentation"
            >
              {open ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {open ? (
        <div
          id="site-nav-dropdown"
          className="fixed inset-x-0 top-[65px] z-40 flex flex-col gap-1 border-b border-white/10 bg-[#0b0c13] px-5 pt-3 pb-4 shadow-2xl md:hidden"
        >
          <SearchForm placeholder="Search agents" className="mb-2" />
          {STORE_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b border-white/10 px-1 py-2.5 text-[15px] text-white/80"
            >
              {item.label}
            </Link>
          ))}
          {/* External links: no close handler needed — navigation replaces
              the document (and Biome's useValidAnchor flags onClick on <a>). */}
          <a
            href="https://gethouston.ai/#download"
            className="border-b border-white/10 px-1 py-2.5 text-[15px] font-medium text-white"
          >
            Download Houston
          </a>
          <a
            href="https://gethouston.ai"
            className="px-1 py-2.5 text-[15px] text-white/80"
          >
            gethouston.ai
          </a>
        </div>
      ) : null}
    </>
  );
}
