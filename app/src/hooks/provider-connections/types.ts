import type { ReactNode } from "react";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import type { ProviderStatus } from "../../lib/tauri";
import type { ToastItem } from "../../stores/ui";

export type AddToast = (toast: Omit<ToastItem, "id">) => void;

export type ProvidersT = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface ProviderLoginDialogState {
  provider: ProviderInfo;
  url: string;
  userCode: string | null;
  instructions?: string | null;
}

export interface ProviderPending {
  id: string;
  mode: "connecting" | "signingOut";
}

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
  copilotDialogOpen?: boolean;
}

export interface ProviderConnections {
  statuses: Record<string, ProviderStatus | undefined>;
  ready: boolean;
  probed: boolean;
  refresh(): Promise<void>;
  connectionState(p: ProviderInfo): ProviderConnectionState;
  connect(p: ProviderInfo): void;
  cancel(p: ProviderInfo): Promise<void>;
  signOut(p: ProviderInfo): void;
  busy: Record<string, "connecting" | "signingOut" | undefined>;
  dialogProps: ProviderConnectionDialogProps;
}
