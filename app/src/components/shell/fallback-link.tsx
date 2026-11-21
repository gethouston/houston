import { cn } from "@houston-ai/core";
import { isTauri } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { openLinkOutside } from "../../lib/external-link-click";
import { openExternalUrl } from "../../lib/open-external-url";

export function FallbackLink({
  href,
  command,
  tone = "link",
  className,
  children,
}: {
  href: string;
  command: string;
  tone?: "link" | "ink";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      className={cn(
        "rounded-full underline outline-none focus-visible:ring-2 focus-visible:ring-focus",
        tone === "link"
          ? "text-link"
          : "font-medium text-ink underline-offset-2",
        className,
      )}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) =>
        openLinkOutside(event, href, {
          desktop: isTauri(),
          open: (url) => openExternalUrl(url, { command }),
        })
      }
    >
      {children}
    </a>
  );
}
