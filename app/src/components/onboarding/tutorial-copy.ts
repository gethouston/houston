/**
 * Every screen the onboarding orchestrator can render, in flow order. The
 * numbered steps (their section + position) live in `lib/setup-steps.ts`; the
 * rest are unnumbered framing/celebration screens.
 *
 *  intro (overview of all steps)
 *  ── Setup ──────────────────────────────────────────
 *  brain → providerLogin → aiConnected ✓
 *  tools → appsConnected ✓
 *  ── Onboarding ─────────────────────────────────────
 *  meet (name) → agentCreated ✓
 *  connectEmail (Gmail/Outlook) → emailConnected ✓
 *  emailIntro (it'll email you) → emailChat (send to myself) → emailSent ✓
 *  finished (tour or connect more)
 *
 * `numbered` steps that drive the "Setup · N of M" eyebrow: brain,
 * providerLogin, tools, meet, connectEmail, emailChat.
 */
export type OnboardingStep =
  | "intro"
  | "brain"
  | "providerLogin"
  | "aiConnected"
  | "tools"
  | "appsConnected"
  | "meet"
  | "agentCreated"
  | "connectEmail"
  | "emailConnected"
  | "emailIntro"
  | "emailChat"
  | "emailSent"
  | "finished";
