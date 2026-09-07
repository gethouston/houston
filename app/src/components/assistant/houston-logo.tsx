import houstonIcon from "../../assets/houston-icon.svg";
import houstonIconWhite from "../../assets/houston-icon-white.svg";
import { useIsDarkTheme } from "../../lib/use-is-dark-theme";

/**
 * Houston's mark in the sidebar rail: the product logo, sized to the rail's
 * shared 16px `h-4 w-4` icon slot. The white variant carries the dark theme
 * (the primary mark is tuned for light surfaces), tracking the app's explicit
 * `data-theme` rather than the OS scheme. Decorative: the row's text label is
 * its accessible name.
 */
export function HoustonLogo() {
  const dark = useIsDarkTheme();
  return (
    <img
      src={dark ? houstonIconWhite : houstonIcon}
      alt=""
      aria-hidden
      className="h-4 w-4 shrink-0 object-contain"
    />
  );
}
