import type { ProviderInfo } from "@houston/protocol";
import { type HttpScope, httpRequest } from "../http";

type ProviderRow = Omit<ProviderInfo, "id"> & { id: string };

/**
 * Lists the AI providers available here, with which ones are connected.
 *
 * One row per provider: the id everything else takes (`openai-codex`), the name
 * the user knows it by ("ChatGPT / Codex (Plus / Pro)"), whether it is
 * connected for this agent (`configured`), which one the agent is on
 * (`isActive`), and the model ids it can run. Read this BEFORE naming a
 * provider or a model anywhere else — those ids are looked up, never invented.
 * @assistant group:providers
 */
export async function listAgentProviders(
  scope: HttpScope,
  agentId: string,
): Promise<ProviderRow[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/providers`,
  );
  return (await res.json()) as ProviderRow[];
}
