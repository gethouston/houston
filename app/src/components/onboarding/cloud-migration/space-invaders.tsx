import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  createState,
  H,
  INV_H,
  INV_W,
  reset,
  SHIP_H,
  SHIP_W,
  SHIP_Y,
  shoot,
  steer,
  step,
  W,
} from "./space-invaders-model";

/**
 * A tiny, tasteful Space Invaders on a <canvas> — a quiet easter egg to pass
 * the time during a long cloud migration. Monochrome (it inherits the
 * surrounding text colour), one life, no audio, no levels: the swarm just
 * speeds up as it thins. All game rules live in `space-invaders-model.ts`; this
 * shell only renders state and wires input. Keyboard input is window-scoped but
 * yields to any focused field, so it never steals typing. Reduced motion → null.
 */
export function SpaceInvaders({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    let color = "#fff";

    // Backing store follows the CSS size and devicePixelRatio.
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * (H / W) * dpr);
      color = getComputedStyle(canvas).color || "#fff";
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      for (const inv of state.invaders)
        if (inv.alive) ctx.fillRect(inv.x, inv.y, INV_W, INV_H);
      for (const b of state.bullets) ctx.fillRect(b.x - 1, b.y - 5, 2, 5);
      for (const b of state.bombs) ctx.fillRect(b.x - 1, b.y, 2, 5);
      // Player ship: a small triangle atop a base.
      ctx.beginPath();
      ctx.moveTo(state.shipX, SHIP_Y);
      ctx.lineTo(state.shipX - SHIP_W / 2, SHIP_Y + SHIP_H);
      ctx.lineTo(state.shipX + SHIP_W / 2, SHIP_Y + SHIP_H);
      ctx.closePath();
      ctx.fill();
      if (state.over) {
        ctx.textAlign = "center";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`score ${state.score} · press space`, W / 2, H / 2);
      }
    }

    function fire() {
      if (state.over) reset(state);
      else shoot(state);
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
      step(state, { left: held.left, right: held.right, dt });
      draw();
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
  }, [reduce]);

  if (reduce) return null;
  return (
    <canvas
      ref={canvasRef}
      className={`w-full text-[var(--ht-space-foreground)] ${className ?? ""}`}
      style={{ aspectRatio: `${W} / ${H}`, touchAction: "none" }}
    />
  );
}
