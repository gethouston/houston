import type { ReactNode } from "react";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import type { ProviderStatus } from "../../lib/tauri";
import type { ToastItem } from "../../stores/ui";

/** The `useUIStore` toast action, extracted so helper hooks stay store-agnostic. */
export type AddToast = (toast: Omit<ToastItem, "id">) => void;

/**
 * The `t` bound to the `providers` namespace. The connections layer deliberately
 * reuses the existing `providers` toast + sign-out-confirm copy (the extraction
 * inherited it from `provider-settings.tsx`) rather than duplicating it under
 * `aiHub`.
 */
export type ProvidersT = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * OAuth relay dialog state for remote/headless engines. The engine surfaces the
 * fallback sign-in URL via `ProviderLoginUrl`; `userCode` is set for codex's
 * device-grant flow (null for Claude's paste-back). Desktop opens the browser
 * directly for a co-located loopback flow (see `shouldOpenLoginUrlDirectly`),
 * but the Claude/Anthropic setup-token paste flow (`instructions` present)
 * always shows this dialog so the user can read the steps and paste the token.
 */
export interface ProviderLoginDialogState {
  provider: ProviderInfo;
  url: string;
  userCode: string | null;
  /** Setup-token paste-flow steps (Claude/Anthropic). Absent for other flows. */
  instructions?: string | null;
}

/** Which provider card is mid-flight, and for which action. Only one at a time. */
export interface ProviderPending {
  id: string;
  mode: "connecting" | "signingOut";
}

/**
 * Opaque prop bag the hub view spreads onto `<ProviderConnectionDialogs>`. It
 * carries every piece of dialog state the hook owns; the dialogs component is a
 * thin, presentational wrapper around the existing shell dialog components.
 */
export interface ProviderConnectionDialogProps {
  confirmSignOutFor: ProviderInfo | null;
  onConfirmSignOutOpenChange(open: boolean): void;
  onConfirmSignOut(): void;
  loginDialog: ProviderLoginDialogState | null;
  onCloseLoginDialog(): void;
  apiKeyDialog: ProviderInfo | null;
  onCloseApiKeyDialog(): void;
  customEndpointDialog: ProviderInfo | null;
  onCloseCustomEndpointDialog(): void;
  copilotDialog: ReactNode;
}

/**
 * Shared provider-connections surface. A faithful extraction of the connection
 * behavior in `provider-settings.tsx`: status probing + refresh, OAuth
 * start/cancel/complete (incl. the `ProviderLoginUrl` / `ProviderLoginComplete`
 * relay and desktop-vs-remote URL handling), api-key + copilot + local
 * (openai-compatible) connect flows, and sign-out behind a confirm.
 */
export interface ProviderConnections {
  /** Merged connect status per provider card id (`checkMergedStatus` over gateway ids). */
  statuses: Record<string, ProviderStatus | undefined>;
  /** False until the first full status probe resolves; gates actionable Connect UI. */
  ready: boolean;
  /**
   * True once the first LIVE probe has resolved. `ready` can flip true off the
   * cached last-scan snapshot; anything that must not act on stale state (the
   * browser's mount auto-select) gates on `probed` instead.
   */
  probed: boolean;
  /** Re-probe every visible provider. */
  refresh(): Promise<void>;
  /**
   * The ONE per-provider reader (HOU-979). Every badge, CTA and grouping reads
   * the full tri-state: `unknown` shows a neutral, visible "checking" instead
   * of claiming Connected (the old behavior, which left a team space's hub
   * reporting connections it could not see) or offering Connect for an account
   * that is in fact connected. There is deliberately no boolean sibling — one
   * existed, and every surface that reached for it collapsed the third state.
   */
  connectionState(p: ProviderInfo): ProviderConnectionState;
  /** Start a connect. Branches on `p.auth` / `copilotConnect` (may open a dialog). */
  connect(p: ProviderInfo): void;
  /** Abort an in-flight sign-in so the engine slot frees up for a retry. */
  cancel(p: ProviderInfo): Promise<void>;
  /** Open the sign-out confirmation for a provider (the actual logout runs on confirm). */
  signOut(p: ProviderInfo): void;
  /** In-flight action per provider card id. */
  busy: Record<string, "connecting" | "signingOut" | undefined>;
  /** Props for the once-rendered dialog stack. */
  dialogProps: ProviderConnectionDialogProps;
}
