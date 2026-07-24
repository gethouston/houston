import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { H, W } from "./space-invaders-defs";
import { drawGame } from "./space-invaders-draw";
import { createState, reset, shoot, steer, step } from "./space-invaders-model";

const BEST_KEY = "houston.migration.invaders.best";

/**
 * A tiny Space Invaders on a <canvas> — a quiet easter egg to pass the time
 * during a long cloud migration. Emoji sprites (👾🛸👽🤖 vs 🚀, 💥 on kills)
 * over ink-colored HUD/shots that inherit the surrounding text colour; one
 * life, no audio, no levels: the swarm just speeds up as it thins. Game rules
 * live in `space-invaders-model.ts`, frame rendering in `space-invaders-draw.ts`;
 * this shell wires input, the rAF loop, and the persisted best score. Keyboard
 * input is window-scoped but yields to any focused field, so it never steals
 * typing. Reduced motion → null.
 */
export function SpaceInvaders({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bestRef = useRef<number | null>(null);
  const { t } = useTranslation("migration");

  useEffect(() => {
    if (reduce) return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext("2d");
    if (!ctx2d) return;
    // Non-null aliases so the hoisted inner functions keep the narrowing.
    const canvas = canvasEl;
    const ctx = ctx2d;

    const state = createState();
    const held = { left: false, right: false };
    let best = bestRef.current ?? 0;
    let recordedOver = false;
    let elapsed = 0;
    // Filled from the canvas's resolved `color` (text-ink) on resize, before the
    // first draw; the literal is only a pre-resize fallback (dark ink on light).
    let color = "#0d0d0d";
    if (bestRef.current === null) {
      try {
        best = Number(localStorage.getItem(BEST_KEY)) || 0;
      } catch {
        /* storage disabled — best just starts at 0 */
      }
      bestRef.current = best;
    }

    // Backing store follows the CSS size and devicePixelRatio.
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * (H / W) * dpr);
      color = getComputedStyle(canvas).color || "#0d0d0d";
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function fire() {
      if (state.over) {
        reset(state);
        recordedOver = false;
      } else shoot(state);
    }

    // ── Input: window-scoped, but never steals typing from a focused field ──
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      );
    };
    function onKeyDown(e: KeyboardEvent) {
      if (typing()) return;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") held.left = true;
      else if (k === "ArrowRight" || k === "d" || k === "D") held.right = true;
      else if (k === " " || k === "Spacebar") fire();
      else return;
      e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") held.left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") held.right = false;
    }
    function onSteer(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      steer(state, ((e.clientX - rect.left) / rect.width) * W);
    }
    function onPointerDown(e: PointerEvent) {
      onSteer(e);
      fire();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointermove", onSteer);
    canvas.addEventListener("pointerdown", onPointerDown);

    // ── ~60fps rAF loop ──
    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      step(state, { left: held.left, right: held.right, dt });
      if (state.over && !recordedOver) {
        recordedOver = true;
        if (state.score > best) {
          best = state.score;
          bestRef.current = best;
          try {
            localStorage.setItem(BEST_KEY, String(best));
          } catch {
            /* storage disabled — the run's best just isn't remembered */
          }
        }
      }
      drawGame(ctx, canvas, state, {
        color,
        best,
        elapsed,
        overLine: t("game.over", { score: state.score }),
        playAgainLine: t("game.playAgain"),
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointermove", onSteer);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [reduce, t]);

  if (reduce) return null;
  return (
    <canvas
      ref={canvasRef}
      className={`w-full text-ink ${className ?? ""}`}
      style={{ aspectRatio: `${W} / ${H}`, touchAction: "none" }}
    />
  );
}
