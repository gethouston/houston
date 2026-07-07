import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  createNebulaProgram,
  readSpaceGlPalette,
  SPACE_PALETTE_TOKENS,
} from "./nebula-program";
import { UNIFORMS } from "./nebula-shader";

/**
 * The nebula layer of {@link SpaceBackground}: a fullscreen WebGL fragment shader
 * (see {@link ./nebula-shader}) that renders a domain-warped FBM nebula in the
 * `--ht-space-*` palette. It sits at the BOTTOM of the backdrop, beneath the
 * canvas starfield.
 *
 * Runtime discipline (per the rendering spec):
 *   - Internal resolution = css · min(DPR, 1.5) · 0.6, GPU-upscaled — the nebula
 *     is soft, so under-rendering is free quality.
 *   - 30 fps draw cap (skipped rAF ticks); paused on `visibilitychange`, with
 *     `u_time` accumulated across pauses so the morph never rewinds on resume.
 *   - Adaptive degrade off the rAF CADENCE (a GPU-load-sensitive signal): if the
 *     native frame delta stays past budget it drops 5 → 3 octaves, then freezes.
 *   - `prefers-reduced-motion` → exactly one static frame, no loop
 *     (`preserveDrawingBuffer` keeps it on screen).
 *   - WebGL unavailable, a malformed palette, or `webglcontextlost` → {@link
 *     onFail}, so the parent swaps in the CSS gradient-glow fallback. No colour is
 *     hardcoded — the palette is read once from the tokens.
 */
export function NebulaGL({ onFail }: { onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Holds a deferred context-loss timer so a React 18 dev double-invoke (mount →
  // cleanup → mount) can cancel it and keep the live context alive.
  const loseTimerRef = useRef(0);

  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (loseTimerRef.current) {
      clearTimeout(loseTimerRef.current);
      loseTimerRef.current = 0;
    }

    // preserveDrawingBuffer keeps a static/reduced-motion frame on screen (the
    // buffer would otherwise be cleared after paint). Acceptable at 864×540.
    const attrs: WebGLContextAttributes = { preserveDrawingBuffer: true };
    const gl = (canvas.getContext("webgl2", attrs) ??
      canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
    if (!gl) return onFail();

    const palette = readSpaceGlPalette();
    if (!palette) return onFail(); // malformed token → fall back, never black
    const built = createNebulaProgram(gl);
    if (!built) return onFail();
    const { program, buffer } = built;
    // Aliased: `gl.useProgram` is a WebGL call, not a React hook (avoids a
    // false positive from the `use*`-named hooks lint rule).
    const activateProgram = gl.useProgram.bind(gl);
    activateProgram(program);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uRes = loc(UNIFORMS.resolution);
    const uTime = loc(UNIFORMS.time);
    const uOct = loc(UNIFORMS.octaves);
    for (const key of Object.keys(SPACE_PALETTE_TOKENS) as Array<
      keyof typeof SPACE_PALETTE_TOKENS
    >) {
      const [r, g, b] = palette[key];
      gl.uniform3f(loc(UNIFORMS[key]), r, g, b);
    }

    let octaves = 5;
    let frozen = false;
    let raf = 0;
    let elapsed = 0; // animation seconds, accumulated across pauses
    let lastDraw = 0; // 30 fps draw cap + elapsed-delta anchor
    let lastFrame = 0; // previous rAF timestamp, for the cadence signal
    let slowFrames = 0;
    const minFrameMs = 1000 / 30;
    const jankMs = 26; // rAF delta above this = below ~38 fps
    const jankWindow = 30; // sustained over this many ticks → degrade

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const draw = () => {
      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uOct, octaves);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    };

    // Degrade off the rAF cadence, not draw-dispatch time (which is
    // GPU-load-independent and could never fire). Measured on EVERY tick at the
    // native refresh rate, so the 30 fps draw cap can't false-positive it.
    const measureJank = (now: number) => {
      if (lastFrame) {
        if (now - lastFrame > jankMs) slowFrames++;
        else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames >= jankWindow) {
          slowFrames = 0;
          if (octaves > 3)
            octaves = 3; // first step: fewer octaves
          else frozen = true; // second step: freeze the current frame
        }
      }
      lastFrame = now;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      measureJank(now);
      if (now - lastDraw < minFrameMs) return; // 30 fps cap
      if (lastDraw) elapsed += Math.min((now - lastDraw) / 1000, 0.1);
      lastDraw = now;
      draw();
      if (frozen) stop();
    };
    const run = () => {
      if (raf || frozen) return;
      lastDraw = 0; // fresh anchor: no pause gap added to `elapsed`
      lastFrame = 0; // fresh anchor: pause gap is not a jank sample
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      onFail();
    };
    const dispose = () => {
      stop();
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      // Defer the context loss: a StrictMode remount clears this timer (above),
      // a real unmount lets it fire and frees the GPU context.
      loseTimerRef.current = window.setTimeout(() => {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        loseTimerRef.current = 0;
      }, 0);
    };

    resize();
    canvas.addEventListener("webglcontextlost", onLost);

    if (reduce) {
      draw(); // one static frame, no loop (a lost context still → onFail)
      const onResize = () => {
        resize();
        draw();
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        dispose();
      };
    }

    const onResize = () => {
      resize();
      if (frozen) draw();
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else run(); // `elapsed` persists — the morph resumes, never rewinds
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    run();

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      dispose();
    };
  }, [reduce, onFail]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
