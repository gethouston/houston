import confetti from "canvas-confetti";

type ConfettiOptions = Parameters<typeof confetti>[0];

/** canvas-confetti's launch point: viewport fractions, `{x: 0, y: 0}` being the
 *  top-left corner and `{x: 1, y: 1}` the bottom-right. */
export interface ConfettiOrigin {
  x: number;
  y: number;
}

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
 * The mission-done payoff: one small burst rising from the bottom of the
 * board. Deliberately lighter and shorter-lived than the setup celebration
 * above — the engine never finishes a mission for you, so this fires every
 * time a user closes one that succeeded. It has to read as a nod, not as a
 * takeover.
 *
 * The origin here is the fallback: single-card moves pass the finished card's
 * own position instead (see {@link missionCardOrigin}), so the burst comes off
 * the card the user just signed off.
 */
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

/** Play a burst sequence unless the OS asks us to avoid motion. */
function fireBursts(bursts: ConfettiOptions[], fire: typeof confetti) {
  if (prefersReducedMotion()) return;
  for (const burst of bursts) fire(burst);
}

/**
 * Fire the setup-complete confetti (unless reduced motion is requested). `fire`
 * is injectable so the burst sequence can be exercised without a DOM in tests;
 * app code calls it with no argument.
 */
export function fireSetupConfetti(fire: typeof confetti = confetti) {
  fireBursts(SETUP_CONFETTI_BURSTS, fire);
}

/**
 * Fire the mission-done confetti, optionally from `origin` (the finished card's
 * position — see {@link missionCardOrigin}); without one the burst keeps its
 * default rise from the bottom of the board. Two rules, both enforced by the
 * callers: call it ONLY after the status mutation has resolved (never
 * optimistically, never on a failed write) so the celebration can't claim a
 * mission finished when the write was rejected, and only for a mission that
 * actually succeeded — `celebratesMissionDone` in `mission-selection.ts` is the
 * single spelling of that second rule. `fire` is injectable exactly as above.
 */
export function fireMissionDoneConfetti(
  origin?: ConfettiOrigin,
  fire: typeof confetti = confetti,
) {
  const bursts = origin
    ? MISSION_DONE_CONFETTI_BURSTS.map((burst) => ({ ...burst, origin }))
    : MISSION_DONE_CONFETTI_BURSTS;
  fireBursts(bursts, fire);
}

/** The attribute every kanban card root carries, set in `@houston-ai/board`'s
 *  KanbanCard (also the board's own drag hit-testing marker). */
const CARD_ID_ATTR = "data-kanban-card";

/** Keep a burst inside the viewport: a card scrolled half out of view would
 *  otherwise launch its confetti off-screen, where nobody sees the payoff. */
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Where mission `itemId`'s board card currently sits, as a confetti origin, so
 * the celebration bursts out of the card the user just finished rather than off
 * the bottom of the screen.
 *
 * Call this BEFORE the status write: a successful move re-renders the card into
 * the Done column, so measuring afterwards would either miss the node or read
 * its new home. Returns `undefined` when there is no DOM (SSR) or no such card
 * on screen — the caller then fires the default burst, because a celebration in
 * the generic place still beats no celebration at all.
 */
export function missionCardOrigin(itemId: string): ConfettiOrigin | undefined {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const { innerWidth: width, innerHeight: height } = window;
  if (!width || !height) return;
  // Matched on the attribute's VALUE rather than interpolated into a selector:
  // mission ids come from the engine, and one that needed CSS escaping would
  // turn this into a thrown SyntaxError on the move path.
  for (const node of document.querySelectorAll(`[${CARD_ID_ATTR}]`)) {
    if (node.getAttribute(CARD_ID_ATTR) !== itemId) continue;
    const rect = node.getBoundingClientRect();
    return {
      x: clamp01((rect.left + rect.width / 2) / width),
      y: clamp01((rect.top + rect.height / 2) / height),
    };
  }
}
