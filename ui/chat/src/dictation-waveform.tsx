/**
 * Live recording waveform for the composer takeover (audio-editor style). While
 * recording, each 100ms amplitude bucket owns a fixed-width slot: buckets fill
 * left→right as a smooth mirrored envelope, and the remainder of the track is a
 * solid hairline leader. Once the track fills, the strip scrolls left with the
 * newest bucket at the right edge — previously drawn history stays pixel-stable,
 * never re-compressed. Requesting shows a full-width hairline pulse; transcribing
 * freezes the final envelope (same stable layout) at reduced opacity under a
 * gentle scanning shimmer.
 *
 * The leading edge (playhead) is a small lucide Rocket "flying" right along the
 * track: an absolutely-positioned DOM overlay (NOT drawn on canvas) moved each
 * rAF frame via `style.transform` on a ref, so per-frame motion never triggers a
 * React re-render. It rides the track midline at `layout.headX` — the left start
 * while requesting, gliding with the head while recording, pinned to the right
 * edge once scrolling — and is hidden while transcribing.
 *
 * Rendered on a devicePixelRatio-scaled <canvas> for crisp, cheap drawing.
 * Colors come from `currentColor` (the wrapper carries `text-muted-foreground`)
 * so it themes without hardcoded hex. Levels are polled with requestAnimationFrame
 * — never through React state — so per-frame updates never trigger a re-render.
 */

import { RocketIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DictationControl } from "./dictation-types";
import { drawWaveform, type WaveformMode } from "./dictation-waveform-draw";
import { computeWaveformLayout } from "./dictation-waveform-math";

/** Rocket overlay size (px). Nose points up-right at rest; +45° faces it right. */
const ROCKET_PX = 15;

function parseColor(canvas: HTMLCanvasElement): string {
  const c = getComputedStyle(canvas).color;
  return c && c !== "" ? c : "rgb(120,120,120)";
}

function modeOf(state: DictationControl["state"]): WaveformMode {
  if (state === "transcribing") return "transcribing";
  if (state === "requesting") return "requesting";
  return "recording";
}

interface Frozen {
  levels: readonly number[];
  elapsedMs: number;
}

export function DictationWaveform({ control }: { control: DictationControl }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rocketRef = useRef<HTMLSpanElement>(null);
  const frozenRef = useRef<Frozen>({ levels: [], elapsedMs: 0 });
  const controlRef = useRef(control);
  controlRef.current = control;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      const c = controlRef.current;
      const color = parseColor(canvas);
      const mode = modeOf(c.state);
      const live = c.getLevels?.() ?? [];
      const liveElapsed = c.recordingStartedAt
        ? Date.now() - c.recordingStartedAt
        : 0;

      // Freeze the exact recording layout (levels + elapsed) so transcribing
      // shows the same stable strip, with no re-compression on freeze.
      if (mode === "recording" && live.length > 0) {
        frozenRef.current = { levels: live, elapsedMs: liveElapsed };
      }
      const source =
        mode === "transcribing" && frozenRef.current.levels.length > 0
          ? frozenRef.current
          : { levels: live, elapsedMs: liveElapsed };

      const layout = computeWaveformLayout(
        source.levels,
        cssW,
        source.elapsedMs,
      );
      const shimmer = mode === "transcribing" ? (Date.now() / 1400) % 1 : 0;
      drawWaveform(ctx, cssW, cssH, color, layout, { mode, shimmer });

      // Fly the rocket to the leading edge. The overlay sits at the container's
      // left/top:50% (the canvas midline); translate centers it on headX and the
      // track midline, rotate(+45deg) turns lucide's up-right nose to face right.
      const rocket = rocketRef.current;
      if (rocket) {
        if (mode === "transcribing") {
          rocket.style.opacity = "0";
        } else {
          rocket.style.opacity = "1";
          const x = layout.headX - ROCKET_PX / 2;
          rocket.style.transform = `translate(${x}px, -50%) rotate(45deg)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pulsing = control.state === "requesting";
  const label =
    control.state === "transcribing"
      ? control.labels.transcribing
      : control.labels.recording;

  return (
    <div
      className="relative flex h-9 min-w-0 flex-1 items-center text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <canvas
        ref={canvasRef}
        className={`h-6 w-full ${pulsing ? "animate-pulse" : ""}`}
      />
      <span
        ref={rocketRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-1/2 text-foreground"
        style={{ opacity: 0, willChange: "transform" }}
      >
        <RocketIcon style={{ width: ROCKET_PX, height: ROCKET_PX }} />
      </span>
    </div>
  );
}
