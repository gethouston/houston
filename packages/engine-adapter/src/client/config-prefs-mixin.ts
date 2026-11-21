import { migrateProviderModel } from "@houston/domain";
import type { Workspace } from "@houston/sdk";
import { TIMEZONE_PREFERENCE, type TimezoneSeedResult } from "@houston/sdk";
import type { ProjectConfig } from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { DEFAULT_AGENT_ID, DEFAULT_AGENT_NAME } from "../synthetic";
import { clearLocalPref, readLocalPref, writeLocalPref } from "./device-prefs";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";
import { teamSlugFromWorkspaceId } from "./workspaces-mixin";

const ACCOUNT_PREF_KEYS = new Set([
  "timezone",
  "next_step_suggestions",
  "locale",
  "migration_reconnect_dismissed",
  "houston_onboarding_segment",
  "houston_onboarding_survey",
  "onboarding_completed",
  "first_message_sent",
  "last_workspace_id",
]);

function storageReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function legacyLocalPref(key: string): string | null {
  try {
    return readLocalPref(key);
  } catch (err) {
    console.warn(
      `[engine-adapter] device copy of "${key}" unreadable, nothing to lift: ${storageReason(err)}`,
    );
    return null;
  }
}

function dropLegacyLocalPref(key: string): void {
  try {
    clearLocalPref(key);
  } catch (err) {
    console.warn(
      `[engine-adapter] device copy of "${key}" left behind, the account value wins: ${storageReason(err)}`,
    );
  }
}

export function ConfigPrefsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ConfigPrefs extends Base {
    resolveWorkspaceSelection<
      T extends Pick<Workspace, "id" | "isDefault" | "kind">,
    >(workspaces: readonly T[] | Promise<readonly T[]>): Promise<T | null> {
      return this.ctx.sdk.preferences.resolveWorkspace(workspaces);
    }
    rememberWorkspaceSelection(value: string | null): Promise<void> {
      return this.ctx.sdk.preferences.rememberWorkspace(value);
    }
    getNextStepSuggestions(): Promise<boolean> {
      return viaSdk(controlPlane.prefPath("next_step_suggestions"), () =>
        this.ctx.sdk.preferences.getNextStepSuggestions(),
      );
    }
    setNextStepSuggestions(enabled: boolean): Promise<boolean> {
      return viaSdk(controlPlane.prefPath("next_step_suggestions"), () =>
        this.ctx.sdk.preferences.setNextStepSuggestions(
          enabled ? "true" : "false",
        ),
      );
    }
    async getPreference(key: string): Promise<string | null> {
      if (key === "last_workspace_id") {
        return viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.get(key),
        );
      }
      if (ACCOUNT_PREF_KEYS.has(key)) {
        const value = await viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.get(key),
        );
        if (value !== null) return value;
        const legacy = legacyLocalPref(key);
        if (legacy !== null) {
          await viaSdk(controlPlane.prefPath(key), () =>
            this.ctx.sdk.preferences.set(key, legacy),
          );
          dropLegacyLocalPref(key);
          return legacy;
        }
        return null;
      }
      const stored = readLocalPref(key);
      if (stored !== null) return stored;
      if (key === "last_agent_id") return DEFAULT_AGENT_ID;
      return null;
    }
    async setPreference(key: string, value: string | null): Promise<void> {
      if (ACCOUNT_PREF_KEYS.has(key)) {
        await viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.set(key, value),
        );
        dropLegacyLocalPref(key);
        return;
      }
      if (value === null) return clearLocalPref(key);
      writeLocalPref(key, value);
    }
    async seedTimezone(
      workspaceId: string,
      detected: string,
    ): Promise<TimezoneSeedResult> {
      const wireId = await this.ctx.workspaceIds.resolve(workspaceId);
      const legacy = legacyLocalPref(TIMEZONE_PREFERENCE);
      const result = await viaSdk(
        controlPlane.prefPath(TIMEZONE_PREFERENCE),
        () =>
          this.ctx
            .sdkForSpace(teamSlugFromWorkspaceId(wireId))
            .preferences.seedTimezone({ detected, legacy }),
      );
      if (legacy !== null && result.kind !== "locked")
        dropLegacyLocalPref(TIMEZONE_PREFERENCE);
      return result;
    }
    async getAgentConfig(): Promise<ProjectConfig> {
      const { provider, model } = await this.ctx.activeOld();
      return { name: DEFAULT_AGENT_NAME, provider, model, effort: "medium" };
    }
    async setAgentConfig(
      agentPath: string,
      config: ProjectConfig,
    ): Promise<ProjectConfig> {
      if (config.provider) {
        const { provider, model, diagnostics } = migrateProviderModel(
          config.provider,
          config.model,
        );
        for (const d of diagnostics)
          console.warn(`[engine-adapter] migrated agent model: ${d.message}`);
        const engine = this.ctx.cp
          ? controlPlane.runtimeClientFor(
              this.ctx.cp,
              agentPath || this.ctx.requireAgentId(),
            )
          : this.ctx.engine;
        await engine.setSettings({ activeProvider: provider, model });
      }
      emitLocalEcho("ConfigChanged", { agentPath });
      return config;
    }
  }
  return ConfigPrefs;
}
