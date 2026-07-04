import type { ReactNode } from "react";
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
 * device-grant flow (null for Claude's paste-back). Desktop never opens this
 * dialog (it opens the browser directly — see `shouldOpenLoginUrlDirectly`).
 */
export interface ProviderLoginDialogState {
  provider: ProviderInfo;
  url: string;
  userCode: string | null;
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
  /** Re-probe every visible provider. */
  refresh(): Promise<void>;
  /** Whether a provider reads as connected (`providerAppearsConnected` over its status). */
  isConnected(p: ProviderInfo): boolean;
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
