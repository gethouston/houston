import { type JSX, useId } from "react";
import { cn } from "../utils";
import { avatarHelmetSize, HoustonHelmet } from "./houston-avatar";

export interface ManagerAvatarProps {
  /** The disc's diameter, in pixels. The halo is drawn outside it and takes
   *  no layout space, so the disc lines up with every employee avatar. */
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

/**
 * The largest disc whose halo still fits a `slot` pixels across. The halo is
 * drawn outside the disc's box and takes no layout space, so a host whose
 * slot sits flush against an edge (the phone roster's row) sizes the disc
 * with this, and the whole mark stays inside the slot.
 */
export function managerAvatarSizeWithin(slot: number): number {
  for (let size = slot; size > 1; size -= 1) {
    if (size + haloLine(size) * 5 <= slot) return size;
  }
  return 1;
}

function units(px: number, size: number): number {
  return Number(((px * BOX) / size).toFixed(3));
}

/**
 * The AI Manager's mark: Houston's brand mark (the helmet every AI Employee
 * wears, so the Manager reads as one of the team) on a disc of the filled
 * primary Button's own material, round like every employee avatar beside it,
 * inside the one thing no employee wears: a thin halo of the same material,
 * set off from the disc by a gap of empty air. The halo covers nothing of the
 * helmet, and the gap shows whatever surface the mark sits on (a row at rest,
 * hovered or selected). It is drawn outside the `size` box, which the SVG
 * lets overflow, so the disc keeps the employee avatars' diameter and column.
 *
 * The disc wears the Button's resting fill and its 1px inset rim, the helmet
 * wears the Button's label colour, the halo the Button's fill, each read from
 * the same `--ht-cta*` token the Button reads, so the mark matches it in both
 * themes and every palette and follows any change to it. Flat, like the
 * Button. The dark Button's backdrop blur is an effect, not a colour, and is
 * left out: the mark sits on its row's own surface, where a blur changes no
 * pixel and would only cost a compositing layer. The helmet takes the
 * employee avatar's ratio at the rendered size, so it sits on whole pixels
 * exactly as it does in a HoustonAvatar of that size. Decorative: the
 * Manager's label beside it is the accessible name.
 */
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
