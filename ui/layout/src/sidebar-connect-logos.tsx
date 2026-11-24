import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export interface SidebarConnectLogo {
  /** Stable key: the app or provider id. */
  id: string;
  /** Any element: the tile's logo box sizes it, whatever it is (an `<img>`,
   *  an `<svg>`, a wrapper), so every row's logos are the same size. A mark
   *  with no colour of its own inherits the tile's ink, so it reads in both
   *  themes. */
  element: ReactNode;
}

/** A stack says "these and more" at three; a fourth only crowds it. */
export const SIDEBAR_CONNECT_LOGO_MAX = 3;

const TILE = {
  row: { tile: "size-5 rounded-md", logo: "size-3.5" },
  rail: { tile: "size-4 rounded-sm", logo: "size-3" },
} as const;

export type SidebarConnectLogoSize = keyof typeof TILE;

/**
 * One logo on its own tile, the way an app icon sits on a home screen: an
 * opaque popover-surface square with the hairline edge and no shadow, so a
 * tile resting on the one behind it covers it cleanly, every logo stays
 * whole, and the stack stays as quiet as the rows around it.
 */
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

/**
 * Up to {@link SIDEBAR_CONNECT_LOGO_MAX} logo tiles stacked into ONE mark,
 * each overlapping the next by 6px, the first on top: the row's icon
 * expanded and the whole control on the icon rail, so both rail states show
 * the same thing. Decorative: the control that carries it is named by its
 * own label, and a logo's alt text would only repeat app names into that
 * name.
 */
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
