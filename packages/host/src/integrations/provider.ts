import type { IntegrationProviderId } from "@houston/protocol";
import type {
  ActionDescription,
  FileUploadRequest,
  FileUploadSlot,
} from "./file-args";
import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
} from "./types";

export interface ActingContext {
  actingAs?: string;
  actingUser?: string;
}

export type ScopeOutcome = "resolved" | "unresolved" | "ignored";

export interface ProviderSearchResult {
  items: ToolMatch[];
  scope?: ScopeOutcome;
}

export interface IntegrationProvider {
  readonly id: IntegrationProviderId;

  readiness(): Promise<ProviderReadiness>;

  listToolkits(): Promise<Toolkit[]>;
  listConnections(userId: string): Promise<Connection[]>;
  connect(userId: string, toolkit: string): Promise<ConnectStart>;
  connection(userId: string, connectionId: string): Promise<Connection | null>;
  disconnect(
    userId: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void>;

  search(
    userId: string,
    query: string,
    acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult>;
  execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
    account?: string,
  ): Promise<ActionResult>;

  describeAction?(
    userId: string,
    action: string,
    acting?: ActingContext,
  ): Promise<ActionDescription | null>;
  reserveFileUpload?(
    userId: string,
    req: FileUploadRequest,
    acting?: ActingContext,
  ): Promise<FileUploadSlot>;
}
