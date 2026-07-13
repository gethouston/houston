"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserMenu } from "./user-menu";

/**
 * The gethouston.ai top menu, on the store: same center links as the landing
 * nav, transparent over the top of the page and a near-opaque dark bar once
 * scrolled (never blurred — the space photo sits behind). "Agent Store" is
 * this site's home and renders active. Store-only actions (Explore, Publish,
 * the account menu) ride the right side; a burger menu carries everything on
 * mobile.
 */

const MENU = [
  { label: "Agents", href: "https://gethouston.ai/#agents" },
  { label: "Features", href: "https://gethouston.ai/#features" },
  { label: "Pricing", href: "https://gethouston.ai/#pricing" },
  { label: "Agent Store", href: "/", active: true },
  { label: "Guides", href: "https://gethouston.ai/guides/" },
  { label: "Vision", href: "https://gethouston.ai/vision/" },
] as const;

const STORE_LINKS = [
  { label: "Explore", href: "/explore" },
  { label: "Publish", href: "/#publish" },
] as const;

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 10);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  const centerLink = (active?: boolean) =>
    active
      ? "text-sm font-semibold text-white"
      : "text-sm text-white/70 transition-colors hover:text-white";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 flex h-[65px] items-center justify-between px-5 transition-colors duration-300 sm:px-10 ${
          scrolled
            ? "border-b border-white/10 bg-[rgba(11,12,19,0.94)]"
            : "bg-transparent"
        }`}
      >
        <a
          href="https://gethouston.ai"
          className="font-[General_Sans,sans-serif] text-[22px] font-medium tracking-tight text-white"
        >
          Houston
        </a>

        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex"
        >
          {MENU.map((item) =>
            "active" in item && item.active ? (
              <Link
                key={item.label}
                href={item.href}
                className={centerLink(true)}
              >
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href} className={centerLink()}>
                {item.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-4">
          {STORE_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="hidden text-sm text-white/70 transition-colors hover:text-white md:inline"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/gethouston/houston"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Houston on GitHub"
            className="hidden text-white/70 transition-colors hover:text-white md:inline-flex"
          >
            <GitHubIcon />
          </a>
          <UserMenu />
          <a
            href="https://gethouston.ai/#download"
            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-[#0d0d0d] transition-colors hover:bg-white/85"
          >
            Download
          </a>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="site-nav-dropdown"
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 lg:hidden"
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
          className="fixed inset-x-0 top-[65px] z-40 flex flex-col border-b border-white/10 bg-[#0b0c13] px-5 pt-2 pb-4 shadow-2xl lg:hidden"
        >
          {MENU.map((item) =>
            "active" in item && item.active ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 px-1 py-2.5 text-[15px] font-semibold text-white"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 px-1 py-2.5 text-[15px] text-white/80"
              >
                {item.label}
              </a>
            ),
          )}
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
          <a
            href="https://github.com/gethouston/houston"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="px-1 py-2.5 text-[15px] text-white/80"
          >
            GitHub
          </a>
        </div>
      ) : null}
    </>
  );
}
