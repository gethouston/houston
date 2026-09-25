import { cn } from "@houston-ai/core";
import houstonIcon from "../../assets/houston-icon.svg";
import houstonIconWhite from "../../assets/houston-icon-white.svg";
import { useIsDarkTheme } from "../../lib/use-is-dark-theme";

/**
 * Houston's mark in the sidebar rail: the product logo, 16px (`h-4 w-4`) on
 * its own and inside the rail's 20px glyph column, matching the phone's More
 * menu and every destination icon. The
 * white variant carries the dark theme (the primary mark is tuned for light
 * surfaces), tracking the app's explicit `data-theme` rather than the OS
 * scheme. Decorative: the row's text label is
 * its accessible name. A caller outside the rail (the phone chat header)
 * passes its own size.
 */
export function HoustonLogo({ className }: { className?: string }) {
  const dark = useIsDarkTheme();
  return (
    <img
      src={dark ? houstonIconWhite : houstonIcon}
      alt=""
      aria-hidden
      className={cn("h-4 w-4 shrink-0 object-contain", className)}
    />
  );
}
