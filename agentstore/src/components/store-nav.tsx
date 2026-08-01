"use client";

import { StoreNav as SharedStoreNav } from "@houston-ai/store";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserMenu } from "@/components/user-menu";

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

/** The website's nav: the SHARED fixed-content StoreNav with web behavior
 *  injected (Next links, site theme persistence). The account control is the
 *  site's own UserMenu — avatar dropdown (Your agents / Sign out) when signed
 *  in, a Sign in button when signed out — injected via `accountSlot` so the
 *  nav is the ONE identity control on every page. */
export function StoreNav() {
  return (
    <SharedStoreNav
      LinkComponent={Link}
      theme={useSiteTheme()}
      accountSlot={<UserMenu />}
    />
  );
}
