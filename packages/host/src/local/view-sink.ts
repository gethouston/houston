import type { ControlPlaneDeps } from "../control-plane-deps";
import type { DocShadow } from "../docs/http-shadow";
import type { DocShadowProjector } from "../docs/projector";

/**
 * Publishes the view routes' answers (providers, usage, custom definitions) to
 * the managed doc store, so the gateway can serve them while the pod is asleep.
 *
 * Two rules make it safe, and both are the reason it is a function rather than
 * a bare `docShadow.put`:
 *
 * - ONE agent per route. A view captured for any other id — a leftover
 *   directory's `/skills` — must never land under the bound agent, the same
 *   cross-post rule the file projector draws.
 * - Publishes are SERIALIZED per family, so two captures in flight land in
 *   capture order. Detached, the older body could win the CAS retry and leave
 *   the store describing a state the pod has already moved past.
 *
 * Cloud pods only: `docShadow` exists solely under dual-write.
 */
export function createViewSink(
  docShadow: DocShadow,
  docProjector: DocShadowProjector,
): NonNullable<ControlPlaneDeps["viewSink"]> {
  const tails = new Map<string, Promise<void>>();
  return (agentId, family, body) => {
    const prior = tails.get(family) ?? Promise.resolve();
    const task = prior
      .then(() => docProjector.boundAgent())
      .then((bound) => {
        if (bound !== agentId) {
          console.warn(
            `[view-docs] refusing ${family} publish for ${agentId} (route bound to ${bound ?? "nothing yet"})`,
          );
          return;
        }
        return docShadow.put(family, body);
      })
      .catch((error: unknown) => {
        console.error(`[view-docs] ${family} publish failed`, error);
      })
      .finally(() => {
        if (tails.get(family) === task) tails.delete(family);
      });
    tails.set(family, task);
  };
}
