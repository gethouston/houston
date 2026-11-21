import type { TriggerEventOption } from "../components/agent/automation-intake/types.ts";

const CATALOG_CHAR_CAP = 6000;

export function eventNameExamples(events: TriggerEventOption[]): string {
  const names = events.slice(0, 4).map((e) => `"${e.name}"`);
  if (names.length === 0) return `"a new item", "a change", or "an update"`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

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

  const bySizeDesc = [...events].sort(
    (a, b) =>
      JSON.stringify(b.configSchema ?? null).length -
      JSON.stringify(a.configSchema ?? null).length,
  );
  for (const e of bySizeDesc) {
    if (render().length <= CATALOG_CHAR_CAP) break;
    keepSchema.delete(e.slug);
  }
  if (render().length > CATALOG_CHAR_CAP) keepDescriptions = false;

  const schemasOmitted = events.some(
    (e) => e.configSchema !== undefined && !keepSchema.has(e.slug),
  );
  return { block: render(), schemasOmitted };
}
