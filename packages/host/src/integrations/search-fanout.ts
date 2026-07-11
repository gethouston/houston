import type { ActingContext } from "./provider";
import type { IntegrationRegistry } from "./registry";
import { IntegrationSigninRequiredError, type ToolMatch } from "./types";

/**
 * Provider-less search = fan out across every registered provider, stamping
 * each match with its provider id so the runtime can route the follow-up
 * execute/connect. One provider's failure must not blank the others' results:
 * a partial failure is logged and its results dropped. Exception: when the
 * merged results come back EMPTY and some provider threw the signin error,
 * that error propagates — it is the actionable reason nothing matched (the
 * signed-out desktop must keep its 409 → in-chat sign-in card behavior).
 */
export async function searchAllProviders(
  registry: IntegrationRegistry,
  userId: string,
  query: string,
  acting: ActingContext | undefined,
): Promise<ToolMatch[]> {
  const ids = registry.ids();
  const settled = await Promise.allSettled(
    ids.map(async (id): Promise<ToolMatch[]> => {
      const items = await registry.get(id).search(userId, query, acting);
      return items.map((item) => ({ ...item, provider: id }));
    }),
  );
  const failures: { id: string; reason: unknown }[] = [];
  const items: ToolMatch[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") items.push(...s.value);
    else failures.push({ id: ids[i] ?? "?", reason: s.reason });
  });
  if (items.length === 0 && failures.length > 0) {
    const signin = failures.find(
      (f) => f.reason instanceof IntegrationSigninRequiredError,
    );
    throw (signin ?? failures[0])?.reason;
  }
  for (const f of failures) {
    console.error(
      `[integrations] search fan-out: provider '${f.id}' failed, dropping its results:`,
      f.reason,
    );
  }
  return items;
}
