import { RocketIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DictationControl } from "./dictation-types";
import { drawWaveform, type WaveformMode } from "./dictation-waveform-draw";
import { computeWaveformLayout } from "./dictation-waveform-math";

const ROCKET_PX = 15;

function canvasColor(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).color;
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
      const color = canvasColor(canvas);
      const mode = modeOf(c.state);
      const live = c.getLevels?.() ?? [];
      const liveElapsed = c.recordingStartedAt
        ? Date.now() - c.recordingStartedAt
        : 0;

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
      className="relative flex h-9 min-w-0 flex-1 items-center text-ink-muted"
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
        className="pointer-events-none absolute left-0 top-1/2 text-ink"
        style={{ opacity: 0, willChange: "transform" }}
      >
        <RocketIcon style={{ width: ROCKET_PX, height: ROCKET_PX }} />
      </span>
    </div>
  );
}
