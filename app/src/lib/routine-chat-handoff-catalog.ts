/**
 * The app's trigger event catalog, serialized for the setup-chat handoff
 * (`routine-chat-handoff.ts`). For an app-event wake the picker chose ONLY the
 * app; WHICH event on it (and its filters) is decided in the chat, so the agent
 * needs the whole catalog as an internal machine block. Kept apart from the
 * handoff assembly so each file stays focused and under the size cap.
 */

import type { TriggerEventOption } from "../components/tabs/automation-intake/types.ts";

/** Rough character budget for the serialized event catalog embedded in the
 *  prompt: enough to guide the agent, small enough to leave room for the chat. */
const CATALOG_CHAR_CAP = 6000;

/** 3-4 quoted event names from the catalog, offered as first-ask examples. */
export function eventNameExamples(events: TriggerEventOption[]): string {
  const names = events.slice(0, 4).map((e) => `"${e.name}"`);
  if (names.length === 0) return `"a new item", "a change", or "an update"`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

/**
 * Serialize the app's event catalog as a compact JSON array the agent reads to
 * pick the exact slug and build the config. Kept under {@link CATALOG_CHAR_CAP}
 * by dropping whole fields (never truncating mid-JSON): the largest `configSchema`
 * entries go first, then descriptions. Reports whether any schema was dropped so
 * the caller can tell the agent to keep those events' filters minimal.
 */
export function triggerCatalogBlock(events: TriggerEventOption[]): {
  block: string;
  schemasOmitted: boolean;
} {
  const keepSchema = new Set(events.map((e) => e.slug));
  let keepDescriptions = true;

  const render = () =>
    JSON.stringify(
      events.map((e) => ({
        slug: e.slug,
        name: e.name,
        ...(keepDescriptions && e.description
          ? { description: e.description }
          : {}),
        ...(keepSchema.has(e.slug) && e.configSchema !== undefined
          ? { configSchema: e.configSchema }
          : {}),
      })),
    );

  // Drop configSchema entries largest-first until under the cap.
  const bySizeDesc = [...events].sort(
    (a, b) =>
      JSON.stringify(b.configSchema ?? null).length -
      JSON.stringify(a.configSchema ?? null).length,
  );
  for (const e of bySizeDesc) {
    if (render().length <= CATALOG_CHAR_CAP) break;
    keepSchema.delete(e.slug);
  }
  // Still over? Drop descriptions too.
  if (render().length > CATALOG_CHAR_CAP) keepDescriptions = false;

  const schemasOmitted = events.some(
    (e) => e.configSchema !== undefined && !keepSchema.has(e.slug),
  );
  return { block: render(), schemasOmitted };
}
