import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  makeStars,
  parseHex,
  type SpacePalette,
  type Star,
} from "./starfield-model";
import { makeBloomSprites, makeStaticLayer } from "./starfield-sprites";

/**
 * Canvas starfield for {@link SpaceBackground}, the middle layer over the WebGL
 * nebula. A photorealistic night-sky field whose generation lives in
 * {@link ./starfield-model} — magnitude-skewed stars (most faint, few bright)
 * across a near + far depth layer, colour-temperature variety, a Milky-Way
 * density band with a painted haze, temperature-tinted bloom on the brightest,
 * plus a static corner vignette. (Banding is handled by the nebula shader's
 * dither, so this layer no longer paints grain.)
 *
 * The draw loop is allocation-free: each star carries a precomputed `fillStyle`
 * and twinkle rides on `globalAlpha`; the static layer and the three tinted bloom
 * halos are offscreen sprites `drawImage`d per frame. Only faint stars twinkle
 * (±15%, 5–12s), and drift is near-still (≤0.8px/s, the far layer at half speed),
 * wrapping at the edges. Honours `prefers-reduced-motion` by painting a single
 * static frame.
 */
export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const read = (name: string) =>
      parseHex(
        getComputedStyle(document.documentElement)
          .getPropertyValue(name)
          .trim(),
      );
    const palette: SpacePalette = {
      star: read("--ht-space-star"),
      starWarm: read("--ht-space-star-warm"),
      haze: read("--ht-space-haze"),
      canvas: read("--ht-space-canvas"),
    };
    const blooms = makeBloomSprites(palette);

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let staticLayer: HTMLCanvasElement | null = null;
    let raf = 0;
    let last = performance.now();

    const build = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(w, h, palette);
      staticLayer = makeStaticLayer(w, h, dpr, palette);
    };

    const paint = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      if (staticLayer) ctx.drawImage(staticLayer, 0, 0, w, h);
      for (const s of stars) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 0) s.x += w;
        else if (s.x > w) s.x -= w;
        if (s.y < 0) s.y += h;
        else if (s.y > h) s.y -= h;

        let a = s.peak;
        if (s.twinkle) a += s.amp * Math.sin(t * s.speed + s.phase);
        if (a < 0) a = 0;
        else if (a > 1) a = 1;

        ctx.fillStyle = s.fillStyle;
        if (s.bloom) {
          ctx.globalAlpha = a * 0.35;
          ctx.drawImage(
            blooms[s.bloomTemp],
            s.x - s.bloomR,
            s.y - s.bloomR,
            s.bloomR * 2,
            s.bloomR * 2,
          );
        }
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    build();

    // Reduced motion: one static frame, no loop. Still re-render on resize.
    if (reduce) {
      paint(0, 0);
      const onResize = () => {
        build();
        paint(0, 0);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      paint(now / 1000, dt);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onResize = () => build();
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!raf) start();
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
