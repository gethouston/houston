"use client";

import { StoreNav as SharedStoreNav } from "@houston-ai/store";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserMenu } from "@/components/user-menu";

const THEME_KEY = "houston-store-theme";

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

export function StoreNav() {
  return (
    <SharedStoreNav
      LinkComponent={Link}
      theme={useSiteTheme()}
      accountSlot={<UserMenu />}
    />
  );
}
