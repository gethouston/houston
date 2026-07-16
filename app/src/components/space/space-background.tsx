import { useState } from "react";
import milkyway1280Avif from "../../assets/space/milkyway-1280.avif";
import milkyway1280Jpg from "../../assets/space/milkyway-1280.jpg";
import milkyway1280Webp from "../../assets/space/milkyway-1280.webp";
import milkyway1920Avif from "../../assets/space/milkyway-1920.avif";
import milkyway1920Jpg from "../../assets/space/milkyway-1920.jpg";
import milkyway1920Webp from "../../assets/space/milkyway-1920.webp";
import milkyway2560Avif from "../../assets/space/milkyway-2560.avif";
import milkyway2560Jpg from "../../assets/space/milkyway-2560.jpg";
import milkyway2560Webp from "../../assets/space/milkyway-2560.webp";

const AVIF_SRCSET = `${milkyway1280Avif} 1280w, ${milkyway1920Avif} 1920w, ${milkyway2560Avif} 2560w`;
const WEBP_SRCSET = `${milkyway1280Webp} 1280w, ${milkyway1920Webp} 1920w, ${milkyway2560Webp} 2560w`;
const JPG_SRCSET = `${milkyway1280Jpg} 1280w, ${milkyway1920Jpg} 1920w, ${milkyway2560Jpg} 2560w`;

/** `--ht-space-canvas` at a given opacity — the scrim's only colour. */
const veil = (alpha: number) =>
  `color-mix(in srgb, var(--ht-space-canvas) ${Math.round(alpha * 100)}%, transparent)`;

/**
 * Readability veil over the photo, ported from the landing page
 * (`website/src/assets/space.css`): slightly stronger top and bottom, lighter
 * through the middle third so the bright galactic core still reads as a
 * photograph rather than a flat wash, plus a faint radial vignette pulling
 * focus to center. The middle stops run a touch stronger than the landing's
 * (0.5 vs 0.4) because the app centers text directly over the galactic core,
 * where the landing only scrolls past it. Colour comes from
 * `--ht-space-canvas`, never a literal.
 */
const SCRIM_BACKGROUND = [
  `radial-gradient(ellipse 120% 80% at 50% 38%, ${veil(0)} 40%, ${veil(0.55)} 100%)`,
  `linear-gradient(180deg, ${veil(0.68)} 0%, ${veil(0.5)} 16%, ${veil(0.5)} 48%, ${veil(0.58)} 78%, ${veil(0.72)} 100%)`,
].join(", ");

/**
 * SVG fractal-noise film that kills gradient banding on the large dark ramps
 * (near-invisible, 0.025 alpha) — same technique as the landing page scrim.
 */
const NOISE_FILM =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Deep-space backdrop shared by the whole pre-workspace flow (sign-in,
 * onboarding, gates, loading splash). An absolutely-positioned,
 * pointer-events-none, aria-hidden layer that sits BEHIND the floating card
 * and gives it something quiet to pop against (Mercury pattern: dark backdrop,
 * light card).
 *
 * The image is the SAME Milky Way photograph the landing page uses (ESO
 * panorama eso0932a, ESO/S. Brunier, CC BY 4.0; assets shared with
 * `website/src/assets/space/`), so the marketing site and the app's first-run
 * experience read as one scene. Three stacked sublayers:
 *
 *   1. Base — a near-black indigo gradient (canvas-glow → canvas), always
 *      painted so nothing flashes while the photo decodes.
 *   2. The photograph — AVIF/WebP/JPEG at three widths, `object-cover`,
 *      framed at the landing page's `center 42%` so the galactic core sits in
 *      the upper third behind the card. Fades in on decode (skipped under
 *      `prefers-reduced-motion`).
 *   3. Scrim — the landing scrim: gradient veil + radial vignette + a faint
 *      fractal-noise film against banding.
 */
export function SpaceBackground({ className }: { className?: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden${
        className ? ` ${className}` : ""
      }`}
    >
      {/* 1. Base gradient — the decode backdrop. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--ht-space-canvas-glow) 0%, var(--ht-space-canvas) 55%)",
        }}
      />

      {/* 2. The Milky Way photograph. */}
      <picture>
        <source type="image/avif" srcSet={AVIF_SRCSET} sizes="100vw" />
        <source type="image/webp" srcSet={WEBP_SRCSET} sizes="100vw" />
        <img
          src={milkyway1920Jpg}
          srcSet={JPG_SRCSET}
          sizes="100vw"
          alt=""
          width={2560}
          height={1440}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none"
          style={{ objectPosition: "center 42%", opacity: loaded ? 1 : 0 }}
        />
      </picture>

      {/* 3. Readability scrim + anti-banding noise film. */}
      <div
        className="absolute inset-0"
        style={{ background: SCRIM_BACKGROUND }}
      />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: NOISE_FILM }}
      />
    </div>
  );
}
