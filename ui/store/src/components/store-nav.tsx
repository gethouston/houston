"use client";

import { LogIn, Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { StoreLinkComponent } from "../types";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;

export interface StoreNavUser {
  avatarUrl?: string;
  initial: string;
}

export interface StoreNavProps {
  homeHref?: string;
  brandLabel?: string;
  theme?: { isDark: boolean; onToggle: (next: "light" | "dark") => void };
  account?: {
    user: StoreNavUser | null;
    href?: string;
    onOpen?: () => void;
  };
  accountSlot?: ReactNode;
  labels?: Partial<{
    toLight: string;
    toDark: string;
    account: string;
    signIn: string;
  }>;
  LinkComponent?: StoreLinkComponent;
}

const CONTROL_CLASS =
  "grid size-9 place-items-center rounded-full text-ink-muted outline-none transition-colors duration-150 hover:bg-chip hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/50";

function AccountFace({ user }: { user: StoreNavUser | null }) {
  if (!user) return <LogIn className="size-5 text-ink-muted" />;
  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="size-8 rounded-full object-cover"
    />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-chip font-medium text-[13px] text-ink-muted">
      {user.initial}
    </span>
  );
}

export function StoreNav({
  homeHref = "/",
  brandLabel = "Agent Store",
  theme,
  account,
  accountSlot,
  labels = {},
  LinkComponent = PlainLink,
}: StoreNavProps) {
  const themeLabel = theme?.isDark
    ? (labels.toLight ?? "Switch to light mode")
    : (labels.toDark ?? "Switch to dark mode");
  const accountLabel = account?.user
    ? (labels.account ?? "Your profile")
    : (labels.signIn ?? "Sign in");
  const accountBody = account ? <AccountFace user={account.user} /> : null;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!(entry?.isIntersecting ?? true)),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      <nav
        className={`sticky top-0 z-40 w-full transition-colors duration-150 ${
          scrolled ? "bg-background/90 backdrop-blur-md" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-5 px-6 py-4 md:px-8">
          <LinkComponent
            href={homeHref}
            className="shrink-0 font-medium text-[22px] text-ink"
          >
            {brandLabel}
          </LinkComponent>
          <div className="flex items-center gap-3">
            {theme && (
              <button
                type="button"
                aria-label={themeLabel}
                title={themeLabel}
                onClick={() => theme?.onToggle(theme.isDark ? "light" : "dark")}
                className={CONTROL_CLASS}
              >
                {theme?.isDark ? (
                  <Sun aria-hidden className="size-5" />
                ) : (
                  <Moon aria-hidden className="size-5" />
                )}
              </button>
            )}
            {accountSlot ??
              (account &&
                (account.href ? (
                  <LinkComponent
                    href={account.href}
                    aria-label={accountLabel}
                    title={accountLabel}
                    className={CONTROL_CLASS}
                  >
                    {accountBody}
                  </LinkComponent>
                ) : (
                  <button
                    type="button"
                    aria-label={accountLabel}
                    title={accountLabel}
                    onClick={account.onOpen}
                    className={CONTROL_CLASS}
                  >
                    {accountBody}
                  </button>
                )))}
          </div>
        </div>
      </nav>
    </>
  );
}
