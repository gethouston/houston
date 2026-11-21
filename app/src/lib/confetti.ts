import confetti from "canvas-confetti";

type ConfettiOptions = Parameters<typeof confetti>[0];

export interface ConfettiOrigin {
  x: number;
  y: number;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BASE = { startVelocity: 45, ticks: 220, zIndex: 9999, scalar: 0.9 };

export const SETUP_CONFETTI_BURSTS: ConfettiOptions[] = [
  { ...BASE, particleCount: 140, spread: 80, origin: { x: 0.5, y: 0.55 } },
  {
    ...BASE,
    particleCount: 70,
    spread: 60,
    angle: 60,
    origin: { x: 0, y: 0.7 },
  },
  {
    ...BASE,
    particleCount: 70,
    spread: 60,
    angle: 120,
    origin: { x: 1, y: 0.7 },
  },
];

export const MISSION_DONE_CONFETTI_BURSTS: ConfettiOptions[] = [
  {
    ...BASE,
    startVelocity: 38,
    ticks: 120,
    scalar: 0.75,
    particleCount: 55,
    spread: 70,
    origin: { x: 0.5, y: 0.85 },
  },
];

function fireBursts(bursts: ConfettiOptions[], fire: typeof confetti) {
  if (prefersReducedMotion()) return;
  for (const burst of bursts) fire(burst);
}

export function fireSetupConfetti(fire: typeof confetti = confetti) {
  fireBursts(SETUP_CONFETTI_BURSTS, fire);
}

export function fireMissionDoneConfetti(
  origin?: ConfettiOrigin,
  fire: typeof confetti = confetti,
) {
  const bursts = origin
    ? MISSION_DONE_CONFETTI_BURSTS.map((burst) => ({ ...burst, origin }))
    : MISSION_DONE_CONFETTI_BURSTS;
  fireBursts(bursts, fire);
}

const CARD_ID_ATTR = "data-kanban-card";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function missionCardOrigin(itemId: string): ConfettiOrigin | undefined {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const { innerWidth: width, innerHeight: height } = window;
  if (!width || !height) return;
  for (const node of document.querySelectorAll(`[${CARD_ID_ATTR}]`)) {
    if (node.getAttribute(CARD_ID_ATTR) !== itemId) continue;
    const rect = node.getBoundingClientRect();
    return {
      x: clamp01((rect.left + rect.width / 2) / width),
      y: clamp01((rect.top + rect.height / 2) / height),
    };
  }
}
