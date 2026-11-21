import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { H, W } from "./space-invaders-defs";
import { drawGame } from "./space-invaders-draw";
import { createState, reset, shoot, steer, step } from "./space-invaders-model";

const BEST_KEY = "houston.migration.invaders.best";

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
    const canvas = canvasEl;
    const ctx = ctx2d;

    const state = createState();
    const held = { left: false, right: false };
    let best = bestRef.current ?? 0;
    let recordedOver = false;
    let elapsed = 0;
    let color = "";
    if (bestRef.current === null) {
      try {
        best = Number(localStorage.getItem(BEST_KEY)) || 0;
      } catch {}
      bestRef.current = best;
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * (H / W) * dpr);
      color = getComputedStyle(canvas).color;
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
          } catch {}
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
