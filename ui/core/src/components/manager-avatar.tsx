import { type JSX, useId } from "react";
import { cn } from "../utils";
import { avatarHelmetSize, HoustonHelmet } from "./houston-avatar";

export interface ManagerAvatarProps {
  size: number;
  className?: string;
}

const FILL = "var(--ht-cta)";
const RIM = "var(--ht-cta-rim)";
const LABEL = "var(--ht-cta-text)";

const BOX = 100;
const CENTRE = BOX / 2;

function haloLine(size: number): number {
  return Math.max(1, Math.round((size / 24) * 2) / 2);
}

function halo(size: number): { radius: number; stroke: number } {
  const line = haloLine(size);
  const gap = line * 1.5;
  return {
    radius: units(size / 2 + gap + line / 2, size),
    stroke: units(line, size),
  };
}

export function managerAvatarSizeWithin(slot: number): number {
  for (let size = slot; size > 1; size -= 1) {
    if (size + haloLine(size) * 5 <= slot) return size;
  }
  return 1;
}

function units(px: number, size: number): number {
  return Number(((px * BOX) / size).toFixed(3));
}

export function ManagerAvatar({
  size,
  className,
}: ManagerAvatarProps): JSX.Element {
  const clipId = `manager-${useId().replace(/[^\w-]/g, "")}-clip`;
  const glyphPx = avatarHelmetSize(size);
  const glyph = units(glyphPx, size);
  const inset = units((size - glyphPx) / 2, size);
  const ring = halo(size);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      data-manager-avatar=""
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={CENTRE} cy={CENTRE} r={CENTRE} />
        </clipPath>
      </defs>
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={ring.radius}
        fill="none"
        strokeWidth={ring.stroke}
        style={{ stroke: FILL }}
        data-manager-halo=""
      />
      <circle cx={CENTRE} cy={CENTRE} r={CENTRE} style={{ fill: FILL }} />
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={CENTRE}
        fill="none"
        style={{ stroke: RIM }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${clipId})`}
      />
      <g transform={`translate(${inset} ${inset})`}>
        <HoustonHelmet color={LABEL} size={glyph} />
      </g>
    </svg>
  );
}
