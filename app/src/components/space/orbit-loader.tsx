import { useReducedMotion } from "framer-motion";
import { OrbitCore, OrbitDefs } from "./orbit-core";
import {
  ORBIT_CENTER,
  ORBIT_PATH,
  ORBIT_PERIOD,
  ORBIT_RX,
  ORBIT_RY,
  ORBIT_TILT,
  ORBIT_VIEWBOX,
  SHIP_POINTS,
  STATIC_SHIP,
  TRAIL,
} from "./orbit-path";

/**
 * OrbitLoader — the workspace-loading centrepiece: a dart ship on a calm,
 * continuous elliptical orbit around a bright pulsing core, trailing a glowing
 * comet streak (amber head -> blue tail, the same warm->cool language as the
 * running {@link HoustonAvatar} halo, so it belongs to the same design system).
 * The streak is a run of soft blurred capsules, tightly spaced and banked along
 * travel, that overlap into one continuous glow rather than reading as discrete
 * darts. The core ({@link OrbitCore}) is a soft bloom + a slow coalescing energy
 * ring + a bright point. Pure inline SVG + SMIL <animateMotion>: no JS animation
 * loop, no per-frame allocation. All colour comes from theme-invariant
 * `--ht-space-*` tokens.
 *
 * SMIL ignores `prefers-reduced-motion`, so we branch on framer-motion's
 * {@link useReducedMotion}: reduced motion renders a single ship parked on the
 * ring beside a static core, with zero <animate*> elements.
 */
export function OrbitLoader() {
  const reduce = useReducedMotion() ?? false;
  return (
    <svg
      width={ORBIT_VIEWBOX}
      height={ORBIT_VIEWBOX}
      viewBox={`0 0 ${ORBIT_VIEWBOX} ${ORBIT_VIEWBOX}`}
      fill="none"
      aria-hidden="true"
    >
      <OrbitDefs path={ORBIT_PATH} />
      <OrbitCore reduce={reduce} />

      {/* Tilted orbit plane: faint ring + the travelling streak + ship. */}
      <g transform={`rotate(${ORBIT_TILT} ${ORBIT_CENTER} ${ORBIT_CENTER})`}>
        <ellipse
          cx={ORBIT_CENTER}
          cy={ORBIT_CENTER}
          rx={ORBIT_RX}
          ry={ORBIT_RY}
          fill="none"
          stroke="var(--ht-space-star)"
          strokeOpacity="0.16"
          strokeWidth="1.2"
        />
        {reduce ? (
          <polygon
            points={SHIP_POINTS}
            fill="var(--ht-space-comet-warm)"
            transform={`translate(${STATIC_SHIP.x} ${STATIC_SHIP.y})`}
          />
        ) : (
          <>
            {/* Comet streak, tail-first so the bright head paints on top. */}
            {TRAIL.map((c) => (
              <ellipse
                key={c.begin}
                rx={c.rx}
                ry={c.ry}
                fill={c.fill}
                opacity={c.opacity}
                filter="url(#orbit-trail-blur)"
              >
                <animateMotion
                  dur={ORBIT_PERIOD}
                  begin={c.begin}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href="#orbit-path" xlinkHref="#orbit-path" />
                </animateMotion>
              </ellipse>
            ))}
            {/* Bright comet head glow, riding under the ship at the head's spot. */}
            <circle r="12" fill="url(#orbit-comet-glow)">
              <animateMotion
                dur={ORBIT_PERIOD}
                begin="0s"
                repeatCount="indefinite"
                rotate="auto"
              >
                <mpath href="#orbit-path" xlinkHref="#orbit-path" />
              </animateMotion>
            </circle>
            {/* Crisp dart ship at the head, painted on top of its streak. */}
            <polygon points={SHIP_POINTS} fill="var(--ht-space-comet-warm)">
              <animateMotion
                dur={ORBIT_PERIOD}
                begin="0s"
                repeatCount="indefinite"
                rotate="auto"
              >
                <mpath href="#orbit-path" xlinkHref="#orbit-path" />
              </animateMotion>
            </polygon>
          </>
        )}
      </g>
    </svg>
  );
}
