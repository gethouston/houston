import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export interface SidebarConnectLogo {
  id: string;
  element: ReactNode;
}

export const SIDEBAR_CONNECT_LOGO_MAX = 3;

const TILE = {
  row: { tile: "size-5 rounded-md", logo: "size-3.5" },
  rail: { tile: "size-4 rounded-sm", logo: "size-3" },
} as const;

export type SidebarConnectLogoSize = keyof typeof TILE;

export function SidebarConnectLogoMark({
  children,
  size = "row",
}: {
  children: ReactNode;
  size?: SidebarConnectLogoSize;
}) {
  return (
    <span
      data-sidebar-connect-logo=""
      className={cn(
        "flex shrink-0 items-center justify-center border border-line bg-popover",
        TILE[size].tile,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center [&>*]:size-full",
          TILE[size].logo,
        )}
      >
        {children}
      </span>
    </span>
  );
}

export function SidebarConnectLogos({
  logos,
  size = "row",
  className,
}: {
  logos: SidebarConnectLogo[];
  size?: SidebarConnectLogoSize;
  className?: string;
}) {
  if (logos.length === 0) return null;
  const shown = logos.slice(0, SIDEBAR_CONNECT_LOGO_MAX);
  return (
    <span
      aria-hidden="true"
      data-sidebar-connect-cluster=""
      className={cn("isolate flex shrink-0 items-center", className)}
    >
      {shown.map((logo, index) => (
        <span
          key={logo.id}
          className={cn("relative flex", index > 0 && "-ml-1.5")}
          style={{ zIndex: shown.length - index }}
        >
          <SidebarConnectLogoMark size={size}>
            {logo.element}
          </SidebarConnectLogoMark>
        </span>
      ))}
    </span>
  );
}
