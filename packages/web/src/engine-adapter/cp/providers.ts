import type { ProviderInfo } from "@houston/protocol";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * A provider row with its id as a plain string. `ProviderInfo["id"]` is an OPEN
 * union (the named ids plus `string & {}`, since pi's registry drifts), which a
 * JSON Schema cannot state — schematizing it expands the widening branch into
 * the whole `String` interface. The wire value is a provider id either way.
 */
type ProviderRow = Omit<ProviderInfo, "id"> & { id: string };

/**
 * The provider status READ, as an adapter operation.
 *
 * The picker and the AI Models screen reach the same route through the runtime
 * client (`listProviders()`), because they must also work against a LOCAL
 * engine that has no control plane in front of it. Declaring the read here is
 * what publishes it to the assistant catalog: every WRITE in the providers
 * group is credential plumbing and hidden, so without this the assistant could
 * change an agent's provider without ever being able to ask which providers
 * exist — which is how it ends up guessing ids.
 */

/**
 * Lists the AI providers Houston can use, with which ones are connected.
 *
 * One row per provider: the id everything else takes (`openai-codex`), the name
 * the user knows it by ("ChatGPT / Codex (Plus / Pro)"), whether it is
 * connected for this agent (`configured`), which one the agent is on
 * (`isActive`), and the model ids it can run. Read this BEFORE naming a
 * provider or a model anywhere else — those ids are looked up, never invented.
 * @assistant group:providers
 */
export async function listAgentProviders(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<ProviderRow[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/providers`);
  return (await res.json()) as ProviderRow[];
}
