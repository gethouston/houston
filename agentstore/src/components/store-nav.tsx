"use client";

import {
  StoreNav as SharedStoreNav,
  type StoreNavUser,
} from "@houston-ai/store";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOptionalSession } from "@/lib/auth/session";

const THEME_KEY = "houston-store-theme";

/** The site's theme state: reads the pre-paint result after mount, applies
 *  and persists the visitor's explicit choice on toggle. */
function useSiteTheme() {
  const [isDark, setIsDark] = useState(false);
  useEffect(
    () => setIsDark(document.documentElement.dataset.theme === "dark"),
    [],
  );
  const onToggle = (next: "light" | "dark") => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setIsDark(next === "dark");
  };
  return { isDark, onToggle };
}

/** The account identity for the nav: null while signed out or unconfigured. */
function useNavUser(): StoreNavUser | null {
  const session = useOptionalSession();
  const user = session?.status === "signed-in" ? session.user : null;
  if (!user) return null;
  return {
    avatarUrl: user.photoURL ?? undefined,
    initial: (user.displayName || user.email || "?")
      .trim()
      .charAt(0)
      .toUpperCase(),
  };
}

/** The website's nav: the SHARED fixed-content StoreNav with web behavior
 *  injected (Next links, site theme persistence, session identity). */
export function StoreNav() {
  return (
    <SharedStoreNav
      LinkComponent={Link}
      theme={useSiteTheme()}
      account={{ user: useNavUser(), href: "/me" }}
    />
  );
}
