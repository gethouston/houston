import {
  canonicalProviderId,
  loadConfig,
  resolveModelChoice,
} from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { buildProviderCatalog } from "../providers/pi-catalog";
import type { Vfs } from "../vfs";

export async function checkedRoutineModel(
  vfs: Vfs,
  root: string,
  pin: Pick<Routine, "provider" | "model">,
): Promise<{ model: Routine["model"] } | { error: string }> {
  if (pin.model == null) return { model: pin.model };
  if (typeof pin.model !== "string") return { error: "invalid 'model'" };
  const rawProvider =
    pin.provider || (await loadConfig(vfs, root)).config.provider;
  if (!rawProvider) return { model: pin.model };
  const provider = canonicalProviderId(rawProvider) ?? rawProvider;
  const catalog = buildProviderCatalog().find((entry) => entry.id === provider);
  const open = [
    "openrouter",
    "opencode",
    "opencode-go",
    "openai-compatible",
  ].includes(provider);
  const resolved = resolveModelChoice(
    pin.model,
    {
      id: provider,
      name: catalog?.name ?? provider,
      connected: true,
      models: open ? undefined : catalog?.models.map((entry) => entry.id),
    },
    "save_routine",
  );
  return resolved.ok ? { model: resolved.id } : { error: resolved.message };
}
