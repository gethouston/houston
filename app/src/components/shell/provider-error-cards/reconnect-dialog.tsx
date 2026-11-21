import { getProvider } from "../../../lib/providers";
import { LocalModelDialog } from "../local-model-dialog";
import { ProviderApiKeyDialog } from "../provider-api-key-dialog";
import type { ReconnectSurface } from "./reconnect-surface";

export function ReconnectDialog({
  surface,
  providerId,
  open,
  onClose,
}: {
  surface: ReconnectSurface;
  providerId: string;
  open: boolean;
  onClose: () => void;
}) {
  const provider = open ? (getProvider(providerId) ?? null) : null;
  if (surface === "api_key_dialog") {
    return <ProviderApiKeyDialog provider={provider} onClose={onClose} />;
  }
  if (surface === "local_model_dialog") {
    return <LocalModelDialog provider={provider} onClose={onClose} />;
  }
  return null;
}
