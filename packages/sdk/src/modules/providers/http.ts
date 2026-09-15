/**
 * The provider status READ, declared where the providers family lives.
 *
 * The picker and the AI Models screen reach this same route through the runtime
 * client (`listProviders()`), because they must also work against a LOCAL
 * engine with no gateway in front of it. Declaring the read here is what
 * publishes it to the assistant's operation catalog: every WRITE in the
 * providers group is credential plumbing and hidden, so without this the
 * assistant could change an agent's provider without ever being able to ask
 * which providers exist — which is how it ends up guessing ids.
 */

import type { ProviderInfo } from "@houston/protocol";
import { type HttpScope, httpRequest } from "../http";

/**
 * A provider row with its id as a plain string. `ProviderInfo["id"]` is an OPEN
 * union (the named ids plus `string & {}`, since pi's registry drifts), which a
 * JSON Schema cannot state — schematizing it expands the widening branch into
 * the whole `String` interface. The wire value is a provider id either way.
 */
type ProviderRow = Omit<ProviderInfo, "id"> & { id: string };

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
  scope: HttpScope,
  agentId: string,
): Promise<ProviderRow[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/providers`,
  );
  return (await res.json()) as ProviderRow[];
}
