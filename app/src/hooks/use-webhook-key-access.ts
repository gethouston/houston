import { type WebhookKeyAccess, webhookKeyAccess } from "@houston/sdk";
import { webhookKeyOwnership } from "../lib/webhook-key-ownership";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useSession } from "./use-session";

export function useWebhookKeyAccess(
  createdBy: string | undefined,
): WebhookKeyAccess {
  const { data: session } = useSession();
  const { capabilities, isLoading } = useCapabilities();
  const workspace = useWorkspaceStore((s) => s.current);
  return webhookKeyAccess({
    createdBy,
    viewerId: session?.uid ?? null,
    ownsSpace: webhookKeyOwnership({
      capabilities,
      capabilitiesLoading: isLoading,
      workspaceId: workspace?.id ?? null,
    }),
  });
}
