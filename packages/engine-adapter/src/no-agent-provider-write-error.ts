/**
 * A provider WRITE that has to land on a specific agent's runtime, attempted
 * in a space whose agent list is settled and EMPTY (PRODUCT-1662).
 *
 * Provider credentials are workspace-central, so connect and sign-out work
 * pre-agent through the hidden setup runtime. A custom OpenAI-compatible
 * endpoint is different: it is NOT a credential but per-runtime state (the
 * runtime's settings + auth files, or the agent's `custom-endpoint.json`), and
 * the setup runtime is torn down the moment the org's first real agent is
 * created, taking anything saved on it along. Saving there would report success
 * and silently lose the endpoint. So a zero-agent space is an EXPECTED state
 * for this write, surfaced as actionable copy ("create an agent first"), never
 * the red bug toast + Sentry pair.
 *
 * Lives in the adapter (never `app/`): the desktop bundle cannot resolve
 * `@houston/app/*`, and `app/src/lib/no-agent-provider-write-error.ts` keeps
 * the app's import path stable.
 */
export class NoAgentForProviderWriteError extends Error {
  constructor() {
    super("Create an agent first, then connect its account.");
    this.name = "NoAgentForProviderWriteError";
  }
}

export function isNoAgentForProviderWriteError(e: unknown): boolean {
  return e instanceof NoAgentForProviderWriteError;
}
