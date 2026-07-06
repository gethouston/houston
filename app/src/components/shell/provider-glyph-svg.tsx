/**
 * Shared SVG wrapper for every provider brand mark. Centralizes the 24x24
 * viewBox, the default 20x20 render size, `currentColor` fill, rounded stroke
 * joins, and the accessible `<title>`/`role` so each mark is just its path(s).
 */
import type { ReactNode } from "react";

export type LogoProps = { className?: string };

export function Glyph({
  label,
  className = "h-5 w-5",
  viewBox = "0 0 24 24",
  fill = "currentColor",
  stroke,
  strokeWidth,
  children,
}: {
  label: string;
  className?: string;
  viewBox?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {children}
    </svg>
  );
}
