import confetti from "canvas-confetti";

type ConfettiOptions = Parameters<typeof confetti>[0];

/** True when the OS asks us to avoid motion — we skip the celebration entirely. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BASE = { startVelocity: 45, ticks: 220, zIndex: 9999, scalar: 0.9 };

/**
 * The overlapping bursts behind the setup-complete payoff: one big center pop
 * plus two angled side jets. Shared verbatim by every "you're set up" moment so
 * the celebration can never drift between screens.
 */
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

/**
 * Fire the setup-complete confetti (unless reduced motion is requested). `fire`
 * is injectable so the burst sequence can be exercised without a DOM in tests;
 * app code calls it with no argument.
 */
export function fireSetupConfetti(fire: typeof confetti = confetti) {
  if (prefersReducedMotion()) return;
  for (const burst of SETUP_CONFETTI_BURSTS) fire(burst);
}
