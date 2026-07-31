import type { TFunction } from "i18next";
import {
  STORE_TEMPLATE_IDS,
  storeCatalogConfigs,
} from "../../agents/builtin/store-catalog";
import { loadStoreTemplate } from "../../agents/builtin/store-template-loader";
import type { OnboardingSegmentChoice } from "../../lib/onboarding-segment";
import { tauriAgents } from "../../lib/tauri";
import {
  type AssistantSetup,
  buildAssistantInstructions,
} from "./personal-assistant-artifacts";
import { buildPersonalAssistantSeeds } from "./personal-assistant-seeds";
import { agentPacksForSegment } from "./segment-agent-pack";

/**
 * Create-time content for the PRIMARY onboarding assistant. When the answered
 * segment maps to one or more store packs, the first pack seeds the primary
 * assistant with its CLAUDE.md + skills/routines/data (the same
 * `loadStoreTemplate` payload the New Agent picker installs); the remaining
 * packs become their own agents via `seedExtraPackAgents`. An unmapped (or
 * skipped) segment falls back to the generic personal-assistant seeds, so a
 * user is never left worse off than before the mapping existed.
 */
export async function assistantContentForSegment(
  setup: AssistantSetup,
  t: TFunction<"setup">,
  locale: string,
  segment: OnboardingSegmentChoice | null,
): Promise<{ instructions: string; seeds: Record<string, string> }> {
  const [primaryPack] = agentPacksForSegment(segment);
  if (primaryPack && STORE_TEMPLATE_IDS.has(primaryPack)) {
    const tpl = await loadStoreTemplate(primaryPack, locale);
    return {
      instructions: tpl.claudeMd ?? buildAssistantInstructions(setup),
      seeds: tpl.seeds,
    };
  }
  return {
    instructions: buildAssistantInstructions(setup),
    seeds: buildPersonalAssistantSeeds(t, locale),
  };
}

/**
 * Seed the SECONDARY role agents — one per store pack beyond the primary — into
 * the onboarding workspace, so a mapped segment ships a small team rather than a
 * single assistant. Each becomes a first-party store agent (its own configId +
 * catalog name + CLAUDE.md/skills), created exactly the way the New Agent picker
 * makes them.
 *
 * Runs in the BACKGROUND after the primary is surfaced (never gates the email
 * step), and is idempotent: a partial prior run is detected by the pack's
 * configId already being present, so a retried / re-mounted first-run never
 * re-creates one and hits the engine's dup-name conflict. An unknown pack id is
 * skipped rather than throwing. Failures surface via the tauri wrapper's toast
 * (beta no-silent-failure policy).
 */
export async function seedExtraPackAgents(
  workspaceId: string,
  packIds: string[],
  locale: string,
): Promise<void> {
  if (packIds.length === 0) return;
  const have = new Set(
    (await tauriAgents.list(workspaceId)).map((a) => a.configId),
  );
  for (const packId of packIds) {
    if (have.has(packId) || !STORE_TEMPLATE_IDS.has(packId)) continue;
    const config = storeCatalogConfigs.find((c) => c.id === packId);
    if (!config) continue;
    const tpl = await loadStoreTemplate(packId, locale);
    await tauriAgents.create(
      workspaceId,
      config.name,
      packId, // configId — the store pack's own identity (name/icon)
      undefined, // color — the engine applies its default
      tpl.claudeMd,
      undefined, // installedPath
      tpl.seeds,
    );
    have.add(packId);
  }
}
