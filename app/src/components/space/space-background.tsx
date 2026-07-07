import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import { NebulaGL } from "./nebula-gl";
import { Starfield } from "./starfield";

/**
 * Deep-space backdrop for the sign-in screen. An absolutely-positioned,
 * pointer-events-none, aria-hidden layer that sits BEHIND the sign-in card and
 * gives it something quiet to pop against (Mercury pattern: dark backdrop, light
 * card). All colour comes from the theme-invariant `--ht-space-*` tokens; three
 * stacked sublayers:
 *
 *   1. Base — a near-black indigo gradient (canvas-glow at top → canvas). Always
 *      rendered; it is also the base for the WebGL fallback.
 *   2. Nebula — a fullscreen WebGL fragment shader ({@link NebulaGL}): a
 *      domain-warped FBM nebula with ridged dust lanes, biased along the
 *      starfield's Milky-Way diagonal, peak luminance ≤ 0.22. If WebGL is
 *      unavailable or the context is lost it calls back and we fall through to
 *      the original framer-motion {@link Nebula} radial glows (two heavily-blurred
 *      barely-there drifts).
 *   3. Stars — a photorealistic canvas starfield (see {@link Starfield}):
 *      magnitude-skewed stars over near + far depth layers, temperature-tinted
 *      bloom, a Milky-Way band, plus a static vignette.
 *
 * All motion honours `prefers-reduced-motion`: the nebula shader renders a single
 * frame (or the fallback glows freeze) and the starfield paints one static frame.
 * Restraint over spectacle — this is a backdrop, never the show.
 */
export function SpaceBackground({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [glFailed, setGlFailed] = useState(false);
  const onFail = useCallback(() => setGlFailed(true), []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden${
        className ? ` ${className}` : ""
      }`}
    >
      {/* 1. Base gradient (also the WebGL-fallback base). */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--ht-space-canvas-glow) 0%, var(--ht-space-canvas) 55%)",
        }}
      />

      {/* 2. Nebula — WebGL shader, or the framer-motion glow fallback. */}
      {glFailed ? (
        <>
          <Nebula
            reduce={!!reduce}
            color="var(--ht-space-nebula-1)"
            style={{
              top: "-18%",
              left: "-8%",
              width: "62vw",
              height: "62vw",
              opacity: 0.1,
            }}
            drift={{ x: [0, 22], y: [0, 14], scale: [1, 1.06] }}
            duration={78}
          />
          <Nebula
            reduce={!!reduce}
            color="var(--ht-space-nebula-2)"
            style={{
              bottom: "-22%",
              right: "-10%",
              width: "55vw",
              height: "55vw",
              opacity: 0.07,
            }}
            drift={{ x: [0, -18], y: [0, -12], scale: [1, 1.07] }}
            duration={88}
          />
        </>
      ) : (
        <NebulaGL onFail={onFail} />
      )}

      {/* 3. Starfield */}
      <Starfield />
    </div>
  );
}

/**
 * Framer-motion radial-glow nebula — the fallback used only when WebGL is
 * unavailable or the context is lost. Two of these very heavily-blurred,
 * barely-there glows drift on near-imperceptible mirrored loops.
 */
function Nebula({
  reduce,
  color,
  style,
  drift,
  duration,
}: {
  reduce: boolean;
  color: string;
  style: React.CSSProperties;
  drift: { x: number[]; y: number[]; scale: number[] };
  duration: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        ...style,
        background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)`,
        filter: "blur(130px)",
      }}
      animate={reduce ? undefined : drift}
      transition={{
        duration,
        ease: "easeInOut",
        repeat: Number.POSITIVE_INFINITY,
        repeatType: "mirror",
      }}
    />
  );
}
