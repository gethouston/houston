import type {
  CustomAuthMode,
  CustomIntegrationDef,
  CustomSpecSource,
} from "./types";

/** What the agent's add tool passes (validated by the sandbox route). */
export type AddCustomIntegrationInput =
  | {
      kind: "openapi";
      name: string;
      spec: CustomSpecSource;
      baseUrl?: string;
      auth: CustomAuthMode;
      slug?: string;
    }
  | {
      kind: "mcp";
      name: string;
      endpoint: string;
      headers?: Record<string, string>;
      auth: CustomAuthMode;
      slug?: string;
    };

/** The persisted definition a validated add input becomes. */
export function defFromAddInput(
  input: AddCustomIntegrationInput,
  slug: string,
): CustomIntegrationDef {
  return input.kind === "openapi"
    ? {
        kind: "openapi",
        slug,
        name: input.name,
        spec: input.spec,
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        auth: input.auth,
        addedAtMs: Date.now(),
      }
    : {
        kind: "mcp",
        slug,
        name: input.name,
        endpoint: input.endpoint,
        ...(input.headers ? { headers: input.headers } : {}),
        auth: input.auth,
        addedAtMs: Date.now(),
      };
}
