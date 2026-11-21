import type { CustomExecutor } from "./executor-host";
import type { CustomAuthMethod } from "./types";

export const TOKEN_VARIABLE = "token";

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
