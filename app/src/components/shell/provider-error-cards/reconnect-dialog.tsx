import { getProvider } from "../../../lib/providers";
import { LocalModelDialog } from "../local-model-dialog";
import { ProviderApiKeyDialog } from "../provider-api-key-dialog";
import type { ReconnectSurface } from "./reconnect-surface";

/**
 * The non-OAuth reconnect surfaces of the `UnauthenticatedCard`: the SAME
 * connect dialogs the AI Models section opens — the api-key paste dialog for
 * api-key providers, the guided endpoint dialog for the local provider. A
 * successful connect fires `ProviderLoginComplete`, which flips the card to
 * done and auto-resumes the task; closing without connecting re-arms the
 * button (the card's `onClose`). OAuth providers render nothing — their
 * reconnect is the browser login, not a dialog.
 */
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
