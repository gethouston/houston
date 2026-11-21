import {
  createTurnCustomContext,
  type TurnCustomContext,
} from "./turn-custom-context";
import { fetchWithTurnSignal } from "./turn-sandbox-signal";

type ContextDeps = Omit<
  Parameters<typeof createTurnCustomContext>[0],
  "grantUrl" | "fetchImpl" | "onChanged"
> & { grant: { url: string } };

export function turnCustomContexts(deps: ContextDeps, fetchImpl: typeof fetch) {
  const touched = new Set<string>();
  const contexts = new Map<AbortSignal | null, TurnCustomContext>();
  const get = async (signal?: AbortSignal | null) => {
    const key = signal ?? null;
    const existing = contexts.get(key);
    if (existing) return existing;
    const context = await createTurnCustomContext({
      ...deps,
      grantUrl: deps.grant.url,
      fetchImpl: fetchWithTurnSignal(fetchImpl, signal),
      onChanged: (slug) => touched.add(slug),
    });
    contexts.set(key, context);
    return context;
  };
  const reset = async () => {
    const open = [...contexts.values()];
    contexts.clear();
    await Promise.all(open.map((context) => context.dispose()));
  };
  return { get, reset, touched: touched as ReadonlySet<string> };
}
