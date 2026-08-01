import { canonicalModelId, canonicalProviderId } from "@houston/domain";

// The send-time app-dialect -> engine-wire pin mapping. Its own module because
// it is a self-contained pure function with its own test file, and synthetic.ts
// (where it used to live) is the synthetic workspace/agent + provider-id dialect
// module, not the send wire.

/**
 * Map a send's app-dialect provider/model/effort overrides to the per-turn
 * WIRE pin (engine ids) — pure, so the send-time mapping is unit-tested
 * without the HTTP client. This is what keeps every conversation on ITS OWN
 * picked provider (HOU-695): the composer forwards the chat's effective
 * provider/model on each send, and the runtime runs the turn on exactly that
 * pin instead of falling back to the agent-wide settings.
 *
 * Fail-soft — never a hard turn failure, and never a pin the user can't see:
 * - a legacy alias maps to its engine id (openai→openai-codex); any other
 *   non-empty provider passes through unchanged, since the pi-ai catalog is open
 *   and the adapter can't enumerate every valid id — the frontend's
 *   effective-provider resolution (against the live catalog) already drops stale
 *   providers before send, and the runtime is the final authority;
 * - a model the mapped provider doesn't own drops just the model (the turn
 *   runs the provider's default) with a diagnostic — an unknown PINNED model
 *   id would hard-fail the turn (the runtime validates pins strictly);
 * - a model with no provider can't be ownership-checked, so it is dropped too;
 * - effort passes through verbatim; an effort-only send still pins it.
 * - mode passes through verbatim; a mode-only send still pins it.
 */
export function wireTurnPin(req: {
  provider?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
}):
  | {
      provider?: string;
      model?: string;
      effort?: string;
      mode?: "execute" | "plan" | "auto";
    }
  | undefined {
  const pin: {
    provider?: string;
    model?: string;
    effort?: string;
    mode?: "execute" | "plan" | "auto";
  } = {};
  if (req.provider) {
    const provider = canonicalProviderId(req.provider);
    if (provider) {
      pin.provider = provider;
      if (req.model) {
        const model = canonicalModelId(provider, req.model);
        if (model) pin.model = model;
        else
          console.warn(
            `[engine-adapter] "${req.model}" is not a known ${provider} model; pinning the provider only`,
          );
      }
    } else {
      console.warn(
        `[engine-adapter] unknown provider "${req.provider}"; the turn uses the engine's own resolution`,
      );
    }
  } else if (req.model) {
    console.warn(
      `[engine-adapter] model "${req.model}" sent without a provider; the turn uses the engine's own resolution`,
    );
  }
  if (req.effort) pin.effort = req.effort;
  if (req.mode) pin.mode = req.mode;
  return pin.provider || pin.effort || pin.mode ? pin : undefined;
}
