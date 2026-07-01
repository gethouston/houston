/**
 * HoustonAvatar — the colored Houston helmet glyph, optionally wrapped in
 * the "card-running-glow" comet halo when an agent is actively working.
 *
 * This is the single source of truth for rendering an agent's avatar
 * across every Houston surface (desktop, mobile, any third-party
 * frontend built on `houston-engine`). Old local copies in `app/` and
 * `mobile/` duplicated the SVG path data + the running-glow wrapper;
 * every tweak had to be done twice. Not anymore.
 *
 * Pair `running` with the `.card-running-glow` rule shipped from
 * `globals.css` so the halo animation stays in lockstep with the
 * kanban card / detail panel variants. If your app doesn't import the
 * core globals, the avatar still renders — the halo is just inert.
 */
import type { CSSProperties } from "react";
import { cn } from "../utils";

const HOUSTON_GRAY = "#9b9b9b";

interface HelmetProps {
  /** Hex fill color. Defaults to Houston gray. */
  color?: string;
  /** Pixel size (width + height). */
  size?: number;
  className?: string;
}

/** Bare Houston helmet SVG. No container, no halo — just the glyph. */
export function HoustonHelmet({
  color = HOUSTON_GRAY,
  size = 24,
  className,
}: HelmetProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 412.248 448.898"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      fill={color}
      aria-hidden="true"
    >
      <path d="M54.438,370.05a372.979,372.979,0,0,0,36.546,16.539c42.934,16.457,81.036,26.955,127.045,32.718,38.952,4.879,98.013,6.119,133.934-9.694l.22-28.709,10.9-4.2.1,7.633c.131,9.532,10.175,10.024,10.111,16.564l-.19,19.454a10.892,10.892,0,0,1-5.271,8.79A125.921,125.921,0,0,1,333.1,442.267c-27.35,5.945-54.827,7.61-83.009,6.115A501.786,501.786,0,0,1,135.308,429.09C98.277,418.317,63.295,404.2,30.364,384.378c-1.82-1.1-4.62-4.1-4.586-5.833l.486-25.225,11.07-8.41c1.485-34.5-.533-22.947-14.764-49.9-27.447-52-29.2-106.518-8.847-163.015,9.56,20.2,21.153,38.25,37.42,52.877C37.675,162.726,27.2,139.979,22.078,114.644,58.63,40.233,137.3-5.66,220.15.562c51,3.831,94.258,25.571,130.394,61.982-11.956-3.184-22.192-5.554-33.74-6.752C275.709,24.666,227.275,10.9,176.055,19.538c-20.923,3.528-34,6.957-50.682,16.877L139.5,33.929l15.86-2.793c8.528-1.5,24.632-1.04,33.836-.192,22.661,2.088,53.554,13.706,71.674,28.987-12.6,3.789-24.839,7.031-37.177,12.526C168.9,96.859,123.836,137.377,92.651,188.4c-7.872-2.92-15.5-4.417-23.465-2.461,29.782,6.032,38.956,41.129,31.8,67.976-2.394,8.985-7.428,16.16-14.663,22.377a346.506,346.506,0,0,0,147.25,97.184l12.006,21.237c1.847,3.267.35,10.053.346,14.518C191.213,405.71,137.381,395,88.063,371.576L54.751,355.753a55.521,55.521,0,0,0-.313,14.3m15.8-103.638c8.757-2.088,12.715-9.164,15.688-16.5,3.95-12.971,2.434-27.431-5.321-38.706-5.394-7.843-14.789-12.194-23.84-9.339A20.8,20.8,0,0,0,43.4,214.587c8.355-7.946,19.246-8.317,27.089-.185,12.642,13.106,13.272,37.962-.251,52.01M56.2,335.674c19.3,9.688,37.093,17.6,57.609,25.556l.46-40.938c.063-5.627-7.1-8.159-10.894-7.39-13.274,2.69-5.888,17.088-7.963,29.218L55.617,322.693c-1,4.557-1.287,9.423.582,12.981m139.579,48.288c1.144-4.393,1.22-8.69-.783-11.451a512.739,512.739,0,0,1-66.018-17.972,16.313,16.313,0,0,0-.129,12.157c8.276,2.7,16.239,5.339,24.7,7.329Z" />
      <path d="M325.964,373.522c-78.683,7.33-171.286-41.71-224.763-98.653,20.982-21.383,19.582-56.385,1.375-79.483,14.126-22.058,29.682-42,48.543-59.74C194.08,95.233,252.771,65.207,312.936,67.539c31.512,1.812,71.082,11.318,70.475,49.792a215.176,215.176,0,0,1,7.448,201.107c3.547,38.249-33.525,51.774-64.9,55.084m-156.623-69.56c44.588,29.3,106.347,54.129,159.883,46.515,8.458-1.2,16.5-3.934,24.588-6.324,5-1.476,7.137-5.17,9.631-9.01,48.185-74.159,42.9-170.662-13.764-238.39C301.111,78.61,245.166,94.247,202.936,121.54c-16.981,10.974-32.909,23.164-46.245,38.481-14.795,16.993-20.759,39.234-21.865,61.356-1.175,23.493,5.307,45.09,17.461,64.8a53.6,53.6,0,0,0,17.054,17.788" />
      <path d="M298.533,409.094c-4.467.414-7.883-1.707-9.4-5.237a12.287,12.287,0,0,1,1.075-10.992c1.473-2.484,5.351-4.9,8.887-5.18l31.941-2.488a8.616,8.616,0,0,1,9.262,6.052c.913,3.365.494,9.3-3.5,10.617-12.359,4.06-24.719,5.973-38.264,7.228" />
      <rect
        width="15.334"
        height="16.211"
        transform="translate(258.6 409.939) rotate(-89.717)"
      />
      <path d="M370.408,283.292c-6.086,17.577-13.539,33.4-26.392,47.208,26.021-57.679,30.288-124.219,4.132-182.266-6.661-14.783-15.007-27.347-24.809-41.076,5.144.8,12.975.86,16.972,4.164,7.836,6.477,12.518,15.527,17.384,24.5,24.5,45.2,29.763,98.227,12.713,147.465" />
    </svg>
  );
}

interface HoustonAvatarProps {
  /** Agent's themed hex color. Drives both the helmet fill AND the
   *  faint circle tint behind it. */
  color?: string;
  /** Outer circle diameter in pixels. Helmet sizes itself to ~65% of
   *  this to match the existing desktop look. */
  diameter?: number;
  /** When true, wraps the badge in a `.card-running-glow` halo — the
   *  same comet-trail effect the desktop uses on kanban cards and the
   *  chat panel header when a session is mid-flight. */
  running?: boolean;
  className?: string;
}

/** Agent avatar badge: colored circle + Houston helmet. Flip `running`
 *  to `true` and the badge grows a spinning comet border without any
 *  other code change required. */
export function HoustonAvatar({
  color,
  diameter = 40,
  running = false,
  className,
}: HoustonAvatarProps) {
  const bg = color ?? HOUSTON_GRAY;
  const innerDiameter = running ? Math.max(diameter - 4, 1) : diameter;
  const inner = (
    <div
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center",
        className,
      )}
      style={{
        width: innerDiameter,
        height: innerDiameter,
        backgroundColor: `color-mix(in srgb, var(--color-secondary, #f5f5f5) 82%, ${bg} 18%)`,
      }}
    >
      <HoustonHelmet color={bg} size={Math.round(innerDiameter * 0.65)} />
    </div>
  );
  if (!running) return inner;
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center card-running-glow"
      style={
        {
          width: diameter,
          height: diameter,
          "--glow-bg": "var(--color-background, #ffffff)",
        } as CSSProperties
      }
    >
      {inner}
    </span>
  );
}
