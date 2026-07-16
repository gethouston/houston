import { migrateProviderModel } from "@houston/domain";
import type { ProjectConfig } from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { DEFAULT_AGENT_ID, DEFAULT_WORKSPACE_ID } from "../synthetic";
import type { BaseCtor } from "./mixin";

/**
 * Preference keys that are ACCOUNT state, not device state. The engine acts on
 * them — the host scheduler fires routines in `timezone` (hosted mode stamps it
 * onto each agent's environment), `locale` backs the workspace wire shape, and
 * the legal/migration flags must survive a reinstall — so they live behind the
 * host's `/v1/preferences/:key`, never in this browser's localStorage. A
 * device-local copy is invisible to the scheduler: routines then fire in the
 * host's zone while the UI renders the browser's, an hours-off "next run"
 * (HOU-732). Everything else (theme, last_agent_id, recent models, …) is
 * per-device UI state and stays local. `houston_onboarding_segment` is here
 * too: the segmentation question must survive across the user's devices, not
 * re-ask on every fresh install.
 */
const ACCOUNT_PREF_KEYS = new Set([
  "timezone",
  "locale",
  "legal_acceptance",
  "migration_reconnect_dismissed",
  "houston_onboarding_segment",
]);

function readLocalPref(key: string): string | null {
  try {
    return localStorage.getItem(`houston.pref.${key}`);
  } catch {
    return null; /* storage disabled */
  }
}

function removeLocalPref(key: string): void {
  try {
    localStorage.removeItem(`houston.pref.${key}`);
  } catch {
    /* storage disabled */
  }
}

export function ConfigPrefsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ConfigPrefs extends Base {
    async getPreference(key: string): Promise<string | null> {
      if (ACCOUNT_PREF_KEYS.has(key)) {
        const cfg = this.ctx.prefConfig();
        const value = await controlPlane.getPreference(cfg, key);
        if (value !== null) return value;
        // One-time lift of a pre-fix device-local copy: earlier builds kept
        // account keys in localStorage only, so the host never learned them.
        // Migrate the stored value up (and drop the local copy) rather than
        // re-deriving it — a deliberately chosen timezone must survive.
        const legacy = readLocalPref(key);
        if (legacy !== null) {
          await controlPlane.setPreference(cfg, key, legacy);
          removeLocalPref(key);
          return legacy;
        }
        return null;
      }
      const stored = readLocalPref(key);
      if (stored !== null) return stored;
      // Default to the synthetic ids so the shell auto-selects the workspace +
      // agent on first load (otherwise no agent is current and the board is empty).
      if (key === "last_workspace_id") return DEFAULT_WORKSPACE_ID;
      if (key === "last_agent_id") return DEFAULT_AGENT_ID;
      return null;
    }
    async setPreference(key: string, value: string): Promise<void> {
      if (ACCOUNT_PREF_KEYS.has(key)) {
        // Delegate the account-key WRITE to the SDK (migration wave 2a): its
        // PreferencesClient issues the identical `PUT /v1/preferences/:key` with
        // body `{value}` over the SAME shared gateway fetch (bearer +
        // `x-houston-org`), and — unlike the agents/activities facades — does NOT
        // refetch. The SDK echoes the stored value; this caller discards it, so
        // the observable request and the `void` result are byte-identical to the
        // old `controlPlane.setPreference`. PUTs never transient-retry in either
        // path, so nothing is lost. The READ stays on `controlPlane.getPreference`
        // (below): cpFetch wraps GETs in `transientRetryFetch`, which the SDK path
        // lacks — delegating it would drop that boot-path retry resilience.
        await this.ctx.sdk.preferences.set(key, value);
        removeLocalPref(key);
        return;
      }
      try {
        localStorage.setItem(`houston.pref.${key}`, value);
      } catch {
        /* storage disabled */
      }
    }
    async getAgentConfig(): Promise<ProjectConfig> {
      const { provider, model } = await this.ctx.activeOld();
      return { name: "Houston", provider, model, effort: "medium" };
    }
    async setAgentConfig(
      agentPath: string,
      config: ProjectConfig,
    ): Promise<ProjectConfig> {
      if (config.provider) {
        // Migrate legacy provider+model ids to ones pi-ai accepts (the runtime's
        // getModel throws on an unknown id → a hard-failed turn). Fail-soft: an
        // unknown value lands on the default + records a diagnostic, never a throw.
        const { provider, model, diagnostics } = migrateProviderModel(
          config.provider,
          config.model,
        );
        for (const d of diagnostics)
          console.warn(`[engine-adapter] migrated agent model: ${d.message}`);
        // Settings are PER-AGENT on the host (`/agents/:id/settings`); the host
        // root has no `/settings` route. In cloud / desktop-new-engine mode this
        // MUST go through the agent's runtime client (the same one activeOld()
        // READS from) — writing via the root client silently 404s, so a model
        // pick never persists and every turn falls back to the active provider.
        const engine = this.ctx.cp
          ? controlPlane.runtimeClientFor(
              this.ctx.cp,
              agentPath || this.ctx.requireAgentId(),
            )
          : this.ctx.engine;
        await engine.setSettings({ activeProvider: provider, model });
      }
      // Write-through echo: the config query keys on agentPath, so the picker
      // flips without waiting for a server round trip. See bus.emitLocalEcho.
      emitLocalEcho("ConfigChanged", { agentPath });
      return config;
    }
  }
  return ConfigPrefs;
}
