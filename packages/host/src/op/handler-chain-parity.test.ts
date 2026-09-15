import { it } from "vitest";

/**
 * The pool-worker op chain (op/handler-chain.ts) is a SECOND hand-ordered copy
 * of the per-agent dispatch surface, and its own comment admits the hazard: "A
 * route added to agents.ts must be added here too, or its op answers 404."
 *
 * Killing that drift is the registry's strongest internal payoff. Once every
 * per-agent route is declared (waves 5a, 5b and 6), wave 7 derives the op chain
 * from `listRoutes()` filtered to `phase: "agent"` minus a declared
 * OP_EXCLUSIONS — today `trigger-status` (gateway-native while an agent sleeps)
 * and `portable/anonymize` (its own op kind) — and this becomes a real test
 * asserting the two sets are equal.
 *
 * It is stated here, in wave 0, so the obligation cannot be forgotten between
 * the wave that makes it possible and the wave that must honour it.
 */
it.todo(
  "the pool-worker op chain equals listRoutes() phase:agent minus OP_EXCLUSIONS (wave 7)",
);
