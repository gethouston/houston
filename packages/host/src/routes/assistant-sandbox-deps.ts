import type { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { AssistantGateway } from "./assistant-forward";

export interface AssistantSandboxDeps {
  vault: CredentialVault;
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  fetchImpl?: typeof fetch;
  assistantGateway?: () => AssistantGateway | null;
  assistantCatalog?: () => AssistantCatalog | null;
  unservedOperations?: () => ReadonlySet<string>;
  gatewayFronted?: boolean;
  approvals?: ApprovalStore;
  persistApprovals?: () => Promise<void>;
}
