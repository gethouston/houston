import { ORBIT_CENTER } from "./orbit-path";

/**
 * Shared SVG <defs> for {@link OrbitLoader}: the invisible motion path, the
 * core-bloom + engine-glow radial gradients, and the trail-blur filter that
 * blends the streak capsules into one continuous glow. Split out so the loader
 * component stays under the 200-line limit.
 */
export function OrbitDefs({ path }: { path: string }) {
  return (
    <defs>
      {/* Motion path (invisible), referenced by every <mpath>. */}
      <path id="orbit-path" d={path} />
      <radialGradient id="orbit-core-glow">
        <stop
          offset="0%"
          stopColor="var(--ht-space-foreground)"
          stopOpacity="1"
        />
        <stop
          offset="24%"
          stopColor="var(--ht-space-star)"
          stopOpacity="0.62"
        />
        <stop
          offset="60%"
          stopColor="var(--ht-space-star)"
          stopOpacity="0.14"
        />
        <stop offset="100%" stopColor="var(--ht-space-star)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="orbit-engine-glow">
        <stop
          offset="0%"
          stopColor="var(--ht-space-foreground)"
          stopOpacity="0.8"
        />
        <stop offset="100%" stopColor="var(--ht-space-star)" stopOpacity="0" />
      </radialGradient>
      {/* Soft blur so the overlapping streak capsules blend into one continuous
          glowing trail instead of reading as discrete blobs. userSpaceOnUse with
          an absolute region: each capsule rides the path centred on its own local
          origin, so one region sized around the largest capsule (rx 8.6, ry 3.2 in
          orbit-path.ts) plus ~3.5x the 2.6 stdDeviation of padding on every side
          holds the full Gaussian falloff. objectBoundingBox percentages gave only
          ~0.6x the (tiny) box height of vertical room, clipping the blur into a
          hard horizontal cutoff on the flat capsules. */}
      <filter
        id="orbit-trail-blur"
        filterUnits="userSpaceOnUse"
        x="-18"
        y="-13"
        width="36"
        height="26"
      >
        <feGaussianBlur stdDeviation="2.6" />
      </filter>
    </defs>
  );
}

const SPLINE = {
  calcMode: "spline",
  keyTimes: "0;0.5;1",
  keySplines: "0.4 0 0.6 1;0.4 0 0.6 1",
  repeatCount: "indefinite",
} as const;

/**
 * The pulsing core — the workspace being assembled: a soft bloom, a slow
 * coalescing energy ring, and a bright centre point. Under reduced motion every
 * layer is a still frame with no <animate*> element.
 */
export function OrbitCore({ reduce }: { reduce: boolean }) {
  return (
    <>
      <circle
        cx={ORBIT_CENTER}
        cy={ORBIT_CENTER}
        r="30"
        fill="url(#orbit-core-glow)"
        opacity={reduce ? 0.6 : undefined}
      >
        {!reduce && (
          <animate
            attributeName="opacity"
            values="0.55;0.95;0.55"
            dur="2.8s"
            {...SPLINE}
          />
        )}
      </circle>
      <circle
        cx={ORBIT_CENTER}
        cy={ORBIT_CENTER}
        r={reduce ? 14 : undefined}
        fill="none"
        stroke="var(--ht-space-foreground)"
        strokeWidth="1"
        strokeOpacity={reduce ? 0.2 : undefined}
      >
        {!reduce && (
          <>
            <animate
              attributeName="r"
              values="11;20;11"
              dur="4.4s"
              {...SPLINE}
            />
            <animate
              attributeName="stroke-opacity"
              values="0.4;0.05;0.4"
              dur="4.4s"
              {...SPLINE}
            />
          </>
        )}
      </circle>
      <circle
        cx={ORBIT_CENTER}
        cy={ORBIT_CENTER}
        r="4"
        fill="var(--ht-space-foreground)"
      />
    </>
  );
}
