import type { CustomExecutor } from "./executor-host";
import type { CustomAuthMethod } from "./types";

/**
 * v1 credential model: ONE secret input per auth method, under the executor's
 * canonical single-secret variable `token`. Multi-variable methods (rare;
 * e.g. Datadog's paired keys) collapse to their first input for now.
 */
export const TOKEN_VARIABLE = "token";

/** The integration's declared auth methods, reduced to collectible fields.
 *  Secret-input methods only: OAuth needs a browser dance this flow does not
 *  run (the card collects a pasted key/token). */
export async function authMethodsOf(
  executor: CustomExecutor,
  slug: string,
): Promise<CustomAuthMethod[]> {
  const integration = await executor.integrations.get(slug);
  const methods = integration?.authMethods ?? [];
  return methods
    .filter((m) => m.kind !== "oauth")
    .map((m) => ({
      template: m.template,
      label: m.label,
      fields: [{ variable: TOKEN_VARIABLE, label: m.label }],
    }));
}
