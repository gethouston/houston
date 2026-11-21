import { canonicalModelId, canonicalProviderId } from "@houston/domain";

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
        pin.model = model ?? req.model;
        if (!model)
          console.warn(
            `[engine-adapter] "${req.model}" is not in the domain ${provider} catalog; pinning it verbatim (the runtime validates)`,
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
