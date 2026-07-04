/**
 * Every screen the onboarding orchestrator can render, in flow order. The
 * numbered steps (their section + position) live in `lib/setup-steps.ts`; the
 * rest are unnumbered framing/celebration screens.
 *
 *  intro (overview of all steps)
 *  ── Setup ──────────────────────────────────────────
 *  brain (pick your AI)
 *  ── Onboarding ─────────────────────────────────────
 *  meet (name) → agentCreated ✓
 *  providerLogin → aiConnected ✓   (after creation: v3 provider login runs
 *                                   inside the agent's runtime, so the agent
 *                                   must exist first)
 *  connectEmail (Gmail/Outlook) → emailConnected ✓
 *  emailChat (send to myself) → emailSent ✓
 *  finished (tour or connect more)
 *
 * The email steps run only where the host serves integrations
 * (`stepAfterAiConnected`); the legacy Rust engine goes aiConnected →
 * finished. `numbered` steps that drive the "Setup · N of M" eyebrow: brain,
 * meet, providerLogin, connectEmail, emailChat.
 */
export type OnboardingStep =
  | "intro"
  | "brain"
  | "meet"
  | "agentCreated"
  | "providerLogin"
  | "aiConnected"
  | "connectEmail"
  | "emailConnected"
  | "emailChat"
  | "emailSent"
  | "finished";
// "onboardingIntro" was cut with the reorder: the intro screen already previews
// the full journey, and the section opener's copy assumed login-then-create.
