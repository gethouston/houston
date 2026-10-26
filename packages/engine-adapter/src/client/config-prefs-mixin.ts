import { migrateProviderModel } from "@houston/domain";
import type { Workspace } from "@houston/sdk";
import { TIMEZONE_PREFERENCE, type TimezoneSeedResult } from "@houston/sdk";
import type { ProjectConfig } from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { DEFAULT_AGENT_ID, DEFAULT_AGENT_NAME } from "../synthetic";
// The device layout lives in ONE module: the SDK reads the same keys through its
// `devicePreferences` port, and a store that refuses still throws from there.
import { clearLocalPref, readLocalPref, writeLocalPref } from "./device-prefs";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";
import { teamSlugFromWorkspaceId } from "./workspaces-mixin";

/** Account keys follow the person; the SDK owns workspace-device migration and ordering. */
const ACCOUNT_PREF_KEYS = new Set([
  "timezone",
  "locale",
  "migration_reconnect_dismissed",
  "houston_onboarding_segment",
  "houston_onboarding_survey",
  "onboarding_completed",
  "first_message_sent",
  "last_workspace_id",
]);

/** The raw diagnostic of a store that refused, for the two notes below. */
function storageReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The same two calls for an ACCOUNT key's pre-fix device copy, where the host
 * is the source of truth and has already answered: a store that refuses the
 * read holds no copy this build could lift anyway, and one that refuses the
 * removal leaves a copy nothing reads (the lift runs only when the host answers
 * null). Rejecting the account read or write over either would turn a
 * preference that DID land on the host into a failure the user cannot act on,
 * so both stay diagnostics.
 */
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
    /** Mirror the displayed space without writing an account preference. */
    rememberWorkspaceSelection(value: string | null): Promise<void> {
      return this.ctx.sdk.preferences.rememberWorkspace(value);
    }
    async getPreference(key: string): Promise<string | null> {
      if (key === "last_workspace_id") {
        return viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.get(key),
        );
      }
      if (ACCOUNT_PREF_KEYS.has(key)) {
        // The account-key READ is the SDK's too: the same `GET
        // /v1/preferences/:key` over the same shared gateway fetch, which carries
        // `cpFetch`'s read retry (`sdk-client.ts`), so this boot-path GET still
        // rides out a rolling deploy or a waking pod. The lone wire difference is
        // a `Content-Type: application/json` header cpFetch stamps on every
        // request: a GET has no body to describe.
        const value = await viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.get(key),
        );
        if (value !== null) return value;
        // One-time lift of a pre-fix device-local copy: earlier builds kept
        // account keys in localStorage only, so the host never learned them.
        // Migrate the stored value up (and drop the local copy) rather than
        // re-deriving it — a deliberately chosen timezone must survive.
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
      // Auto-select the synthetic agent when no device choice exists.
      if (key === "last_agent_id") return DEFAULT_AGENT_ID;
      return null;
    }
    /** `null` CLEARS the preference: the host's `PUT /v1/preferences/:key`
     *  stores a null value, and a device key drops its localStorage entry —
     *  writing the string "null" is what a naive setItem would leave behind. */
    async setPreference(key: string, value: string | null): Promise<void> {
      if (ACCOUNT_PREF_KEYS.has(key)) {
        // The account-key WRITE is the SDK's: its PreferencesClient issues the
        // identical `PUT /v1/preferences/:key` with body `{value}` over the SAME
        // shared gateway fetch (bearer + the route's org scope), and — unlike the
        // agents/activities facades — does NOT refetch. The SDK echoes the
        // stored value; this caller discards it, so the observable request and
        // the `void` result match the control-plane helper byte for byte. PUTs
        // only transient-retry for the idempotent workspace choice.
        await viaSdk(controlPlane.prefPath(key), () =>
          this.ctx.sdk.preferences.set(key, value),
        );
        dropLegacyLocalPref(key);
        return;
      }
      if (value === null) return clearLocalPref(key);
      writeLocalPref(key, value);
    }
    /** The SDK's timezone seed for one space, pinned for the whole request
     *  (`sdkForSpace`), handed this device's pre-account copy to lift. */
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
      if (legacy !== null) dropLegacyLocalPref(TIMEZONE_PREFERENCE);
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
