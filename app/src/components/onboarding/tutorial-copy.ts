/**
 * Every screen the onboarding orchestrator can render, in flow order. Houston
 * ships ONE great default Personal Assistant, so first-run is a single continuous
 * flow (no naming/customization step): connect the AI, connect the email, watch
 * the assistant send one real email, then keep exploring. The numbered steps
 * (their 1-based position) live in `lib/setup-steps.ts`; the rest are unnumbered
 * framing/celebration screens.
 *
 *  connect → aiConnected ✓        — Step 1: connect your AI (agent is created
 *                                    silently the instant the AI connects)
 *  connectEmail → emailConnected ✓ — Step 2: give it access to your email
 *  emailChat → finished 🎉         — Step 3: it sends a real email, then the
 *                                    single payoff screen (explore what it can do)
 *
 * The `connect` step embeds the shared `<ProviderBrowser>` (a curated set:
 * featured providers first, with a "see all" reveal for the rest; every auth
 * type) and auto-advances to `aiConnected` the instant a provider connects. The
 * email steps run only where the host serves integrations
 * (`stepAfterAgentCreated`); the legacy Rust engine skips straight to `finished`.
 * `numbered` steps that drive the "Step N of 3" eyebrow: connect, connectEmail,
 * emailChat.
 */
export type OnboardingStep =
  | "connect"
  | "aiConnected"
  | "connectEmail"
  | "emailConnected"
  | "emailChat"
  | "finished";
