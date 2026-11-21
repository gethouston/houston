import type { Capabilities } from "@houston/protocol";
import type { MountAdmin } from "./admin-seam";
import type { ControlPlaneAssistantDeps } from "./control-plane-assistant-deps";
import type { SharedEndpointStore } from "./credentials/remote-shared-endpoint-store";
import type { ViewFamily } from "./docs/view-capture";
import type { Agent, Workspace, WorkspaceRuntime } from "./domain/types";
import type { EventHub } from "./events/hub";
import type { FeedbackSender } from "./feedback";
import type { WorkspacePaths } from "./paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  TokenVerifier,
  WorkspaceStore,
} from "./ports";
import type { AgentConfigsDeps } from "./routes/agent-configs";
import type { CredentialServeHealer } from "./routes/credential-healer";
import type { CustomIntegrationDeps } from "./routes/custom-integrations";
import type { IntegrationDeps } from "./routes/integrations";
import type { MissionsDeps } from "./routes/missions-sandbox";
import type { FireOutcomeLedger } from "./schedule/fire-outcome";
import type { TranscriptShadow } from "./transcripts/http-shadow";
import type { TriggerEventLock } from "./triggers/fire";
import type { OfficePreview } from "./turn/files-office";
import type { LocalUploadSessions } from "./uploads/local";
import type { Vfs } from "./vfs";

export interface ControlPlaneDeps extends ControlPlaneAssistantDeps {
  verifier: TokenVerifier;
  addressedAgent?: (agentId: string) => void;
  viewSink?: (agentId: string, family: ViewFamily, body: unknown) => void;
  store: WorkspaceStore;
  credentials: CredentialStore;
  sharedEndpoints?: SharedEndpointStore;
  vault: CredentialVault;
  credentialHealer?: CredentialServeHealer;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  vfs?: Vfs;
  uploadSessions?: LocalUploadSessions;
  officePreview?: OfficePreview;
  paths?: WorkspacePaths;
  events?: EventHub;
  capabilities: Capabilities;
  agentDir?: (ws: Workspace, agent: Agent) => string;
  chatHistoryMigrated?: boolean;
  mountAdmin?: MountAdmin;
  feedback?: FeedbackSender;
  integrations?: IntegrationDeps;
  customIntegrations?: CustomIntegrationDeps["customIntegrations"];
  agentConfigs?: AgentConfigsDeps;
  gatewayFronted?: boolean;
  ownerSub?: string;
  loopbackEgress?: boolean;
  storeSyncFlush?: () => Promise<void>;
  agentRequestCount?: () => number;
  agentWriteCount?: () => number;
  triggerLock?: TriggerEventLock;
  routineFireLock?: FireOutcomeLedger;
  routineFireDedupTtlSec?: number;
  transcriptShadow?: TranscriptShadow;
  triggersEnabled?: boolean;
  modelCallReports?: MissionsDeps["modelCallReports"];
  pushReports?: MissionsDeps["pushReports"];
  corsOrigin?: string;
  metrics?: { render(): Promise<string>; contentType: string };
  storeFenced?: () => boolean;
  storeWritable?: () => Promise<boolean>;
  storeSyncAfterWrite?: () => void;
}
