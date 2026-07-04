/**
 * Every screen the onboarding orchestrator can render, in flow order. The
 * numbered steps (their section + position) live in `lib/setup-steps.ts`; the
 * rest are unnumbered framing/celebration screens.
 *
 *  intro (overview of all steps)
 *  ── Setup ──────────────────────────────────────────
 *  brain → providerLogin → aiConnected ✓
 *  ── Onboarding ─────────────────────────────────────
 *  meet (name) → agentCreated ✓
 *  connectEmail (Gmail/Outlook) → emailConnected ✓
 *  emailChat (send to myself) → emailSent ✓
 *  finished (tour or connect more)
 *
 * The email steps run only where the host serves integrations
 * (`stepAfterAgentCreated`); the legacy Rust engine goes agentCreated →
 * finished. `numbered` steps that drive the "Setup · N of M" eyebrow: brain,
 * providerLogin, meet, connectEmail, emailChat.
 */
export type OnboardingStep =
  | "intro"
  | "brain"
  | "providerLogin"
  | "aiConnected"
  | "onboardingIntro"
  | "meet"
  | "agentCreated"
  | "connectEmail"
  | "emailConnected"
  | "emailChat"
  | "emailSent"
  | "finished";
