import { HoustonEngineClient } from "@houston/runtime-client";
import {
  type HoustonSdk,
  type WorkspacePreferenceReporter,
  WorkspaceSelectionState,
} from "@houston/sdk";
import type { Capabilities } from "@houston/wire-types";
import type { ControlPlaneConfig } from "../control-plane";
import {
  gatewayAuthFetch,
  liveToken,
  resetAgentColorSync,
} from "../control-plane";
import {
  conversationCacheScope,
  setConversationCacheIdentity,
} from "../conversation-cache";
import { createEngineSdk } from "../sdk-client";
import { AgentSelection } from "./agent-selection";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
  controlPlane?: boolean;
  onPreferenceError?: WorkspacePreferenceReporter;
}

export abstract class EngineEndpoint extends AgentSelection {
  engine: HoustonEngineClient;
  baseUrl: string;
  token: string;
  sdk: HoustonSdk;
  private readonly workspaceSelection = new WorkspaceSelectionState();
  private readonly preferenceErrors: HoustonClientOptions["onPreferenceError"];
  authFetch: typeof fetch;
  deploymentCaps: Promise<Capabilities | null> | undefined;
  private readonly _cp: ControlPlaneConfig | null;

  constructor(opts: HoustonClientOptions) {
    super();
    this.preferenceErrors = opts.onPreferenceError;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    const useCp =
      opts.controlPlane ??
      (typeof window !== "undefined" &&
        !!(window as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__);
    this._cp = useCp
      ? { baseUrl: opts.baseUrl.replace(/\/+$/, ""), token: opts.token }
      : null;
    const cp = this._cp;
    setConversationCacheIdentity(() =>
      cp ? conversationCacheScope(cp.baseUrl, liveToken(cp.token)) : null,
    );
    const authFetch = gatewayAuthFetch(
      opts.token,
      () => this._cp?.activeOrgSlug,
    );
    this.authFetch = authFetch;
    this.engine = new HoustonEngineClient({
      baseUrl: opts.baseUrl,
      fetch: authFetch,
    });
    this.sdk = createEngineSdk({
      baseUrl: this.baseUrl,
      workspaceSelection: this.workspaceSelection,
      reportPreferenceError: this.preferenceErrors,
      fetch: authFetch,
      liveToken: () => liveToken(this.token),
    });
    if (typeof window !== "undefined") {
      (
        window as unknown as { __HOUSTON_NEW_ENGINE__?: boolean }
      ).__HOUSTON_NEW_ENGINE__ = true;
    }
  }

  get cp(): ControlPlaneConfig | null {
    return this._cp;
  }

  sdkForSpace(orgSlug: string | null): HoustonSdk {
    if (!this._cp) return this.sdk;
    return createEngineSdk({
      baseUrl: this.baseUrl,
      workspaceSelection: this.workspaceSelection,
      reportPreferenceError: this.preferenceErrors,
      fetch: gatewayAuthFetch(this.token, () => orgSlug),
      liveToken: () => liveToken(this.token),
    });
  }

  setEndpoint(opts: { baseUrl: string; token: string }): void {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.deploymentCaps = undefined;
    this.token = opts.token;
    if (this._cp) {
      this._cp.baseUrl = this.baseUrl;
      this._cp.token = opts.token;
    }
    resetAgentColorSync();
    this.authFetch = gatewayAuthFetch(
      opts.token,
      () => this._cp?.activeOrgSlug,
    );
    this.engine = new HoustonEngineClient({
      baseUrl: this.baseUrl,
      fetch: this.authFetch,
    });
    const typing = this.sdk.turns.typingState();
    this.sdk = createEngineSdk({
      baseUrl: this.baseUrl,
      workspaceSelection: this.workspaceSelection,
      reportPreferenceError: this.preferenceErrors,
      fetch: this.authFetch,
      liveToken: () => liveToken(this.token),
    });
    this.sdk.turns.adoptTypingState(typing);
  }

  setActiveOrg(slug: string | null): void {
    if (!this._cp) return;
    if ((this._cp.activeOrgSlug ?? null) === (slug ?? null)) return;
    this._cp.activeOrgSlug = slug;
    this.forgetAgentList();
  }

  prefConfig(): ControlPlaneConfig {
    return this._cp ?? { baseUrl: this.baseUrl, token: this.token };
  }
}
