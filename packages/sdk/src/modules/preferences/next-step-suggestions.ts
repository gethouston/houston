import { EngineError, PreferencesClient } from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";

export const NextStepSuggestionsCommand = {
  GetNextStepSuggestions: "preferences/getNextStepSuggestions",
  SetNextStepSuggestions: "preferences/setNextStepSuggestions",
} as const;

export interface NextStepSuggestionsPreference {
  getNextStepSuggestions(): Promise<boolean>;
  setNextStepSuggestions(value: "true" | "false"): Promise<boolean>;
}

export function createNextStepSuggestionsPreference(
  ctx: ModuleContext,
): NextStepSuggestionsPreference {
  const client = new PreferencesClient({
    baseUrl: ctx.config.baseUrl,
    fetch: ctx.config.ports.fetch,
  });
  async function run<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof EngineError && error.status === 401)
        ctx.authExpiry.notifyExpired();
      throw error;
    }
  }
  /**
   * Reads whether follow-up action bubbles are enabled for you. Defaults to on.
   * @assistant group:settings
   */
  const getNextStepSuggestions = async (): Promise<boolean> =>
    (await run(() => client.getPreference("next_step_suggestions"))) !==
    "false";
  /**
   * Turns follow-up action bubbles on or off. Turning them off uses less of your AI plan.
   * @assistant group:settings unconfirmed: Reversible personal preference.
   */
  const setNextStepSuggestions = async (
    value: "true" | "false",
  ): Promise<boolean> =>
    (await run(() => client.setPreference("next_step_suggestions", value))) !==
    "false";
  ctx.registerCommand(
    NextStepSuggestionsCommand.GetNextStepSuggestions,
    getNextStepSuggestions,
  );
  ctx.registerCommand(
    NextStepSuggestionsCommand.SetNextStepSuggestions,
    (p) => {
      const value = (p as { value?: unknown })?.value;
      if (value !== "true" && value !== "false")
        throw new Error("value must be true or false");
      return setNextStepSuggestions(value);
    },
  );
  return { getNextStepSuggestions, setNextStepSuggestions };
}
