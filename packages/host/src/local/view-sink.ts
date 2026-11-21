import type { ControlPlaneDeps } from "../control-plane-deps";
import type { DocShadow } from "../docs/http-shadow";
import type { DocShadowProjector } from "../docs/projector";

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
