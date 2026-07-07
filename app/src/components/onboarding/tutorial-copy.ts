/**
 * Every screen the onboarding orchestrator can render, in flow order. The
 * numbered steps (their section + position) live in `lib/setup-steps.ts`; the
 * rest are unnumbered framing/celebration screens.
 *
 *  intro (overview of all steps)
 *  ── Setup ──────────────────────────────────────────
 *  connect → aiConnected ✓
 *  ── Onboarding ─────────────────────────────────────
 *  meet (name) → agentCreated ✓
 *  connectEmail (Gmail/Outlook) → emailConnected ✓
 *  emailChat (send to myself) → emailSent ✓
 *  finished (tour or connect more)
 *
 * The `connect` step embeds the shared `<ProviderPicker>` (all catalog
 * providers, every auth type) and auto-advances to `aiConnected` the instant a
 * provider connects. The email steps run only where the host serves integrations
 * (`stepAfterAgentCreated`); the legacy Rust engine goes agentCreated →
 * finished. `numbered` steps that drive the "Setup · N of M" eyebrow: connect,
 * meet, connectEmail, emailChat.
 */
export type OnboardingStep =
  | "intro"
  | "connect"
  | "aiConnected"
  | "onboardingIntro"
  | "meet"
  | "agentCreated"
  | "connectEmail"
  | "emailConnected"
  | "emailChat"
  | "emailSent"
  | "finished";
