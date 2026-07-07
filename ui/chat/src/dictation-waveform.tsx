/**
 * Live recording waveform for the composer takeover (iOS-Messages style). While
 * recording, the elapsed portion of a fixed-width track fills with thin rounded
 * amplitude bars (silence ≈ dot height, speech = tall); the remainder is a
 * dotted leader toward the cap. Requesting shows an all-dots pulse; transcribing
 * freezes the last waveform at reduced opacity under a gentle scanning shimmer.
 *
 * Rendered on a devicePixelRatio-scaled <canvas> for crisp, cheap drawing at up
 * to ~1200 buckets. Colors come from `currentColor` (the wrapper carries
 * `text-muted-foreground`) so it themes without hardcoded hex. Levels are polled
 * with requestAnimationFrame — never through React state — so the recorder's
 * per-frame updates never trigger a re-render.
 */

import { useEffect, useRef } from "react";
import type { DictationControl } from "./dictation-types";
import { downsampleLevels, elapsedBarCount } from "./dictation-waveform-math";

const SLOT_PX = 5; // one bar/dot cell: 2px mark + 3px gap
const BAR_WIDTH = 2;
const DOT_RADIUS = 1;
const BAR_MAX_FRACTION = 0.82; // tallest bar as a fraction of track height
const DOT_ALPHA = 0.32;
const FROZEN_ALPHA = 0.5;

interface DrawState {
  levels: readonly number[];
  elapsedMs: number;
  mode: "recording" | "requesting" | "transcribing";
  shimmer: number; // 0..1 sweep position for the transcribing scanner
}

function parseColor(canvas: HTMLCanvasElement): string {
  const c = getComputedStyle(canvas).color;
  return c && c !== "" ? c : "rgb(120,120,120)";
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  color: string,
  state: DrawState,
): void {
  ctx.clearRect(0, 0, cssW, cssH);
  const totalSlots = Math.max(1, Math.floor(cssW / SLOT_PX));
  const midY = cssH / 2;
  const maxBarH = cssH * BAR_MAX_FRACTION;
  const minBarH = DOT_RADIUS * 2;
  ctx.fillStyle = color;

  const barCount =
    state.mode === "requesting"
      ? 0
      : state.mode === "transcribing"
        ? totalSlots
        : elapsedBarCount(state.elapsedMs, totalSlots);
  const bars = barCount > 0 ? downsampleLevels(state.levels, barCount) : [];

  // Amplitude bars over the elapsed (or frozen) portion.
  for (let i = 0; i < bars.length; i++) {
    const level = bars[i] ?? 0;
    const h = Math.max(minBarH, level * maxBarH);
    const x = i * SLOT_PX + (SLOT_PX - BAR_WIDTH) / 2;
    if (state.mode === "transcribing") {
      const dist = Math.abs(i / Math.max(1, bars.length - 1) - state.shimmer);
      ctx.globalAlpha = FROZEN_ALPHA + Math.max(0, 0.4 - dist) * 0.9;
    } else {
      ctx.globalAlpha = 1;
    }
    roundedBar(ctx, x, midY - h / 2, BAR_WIDTH, h);
  }

  // Dotted leader over the not-yet-elapsed remainder.
  ctx.globalAlpha = DOT_ALPHA;
  for (let i = bars.length; i < totalSlots; i++) {
    const x = i * SLOT_PX + SLOT_PX / 2;
    ctx.beginPath();
    ctx.arc(x, midY, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = w / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function DictationWaveform({ control }: { control: DictationControl }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenRef = useRef<readonly number[]>([]);
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
      const mode =
        c.state === "transcribing"
          ? "transcribing"
          : c.state === "requesting"
            ? "requesting"
            : "recording";
      const live = c.getLevels?.() ?? [];
      if (mode === "recording" && live.length > 0) frozenRef.current = live;
      // Transcribing draws the frozen snapshot captured while recording; fall
      // back to whatever the control still reports if none was captured.
      const levels =
        mode === "transcribing"
          ? frozenRef.current.length > 0
            ? frozenRef.current
            : live
          : live;
      const elapsedMs = c.recordingStartedAt
        ? Date.now() - c.recordingStartedAt
        : 0;
      const shimmer = mode === "transcribing" ? (Date.now() / 1400) % 1 : 0;
      drawTrack(ctx, cssW, cssH, color, { levels, elapsedMs, mode, shimmer });
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
      className="flex h-9 min-w-0 flex-1 items-center text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <canvas
        ref={canvasRef}
        className={`h-6 w-full ${pulsing ? "animate-pulse" : ""}`}
      />
    </div>
  );
}
