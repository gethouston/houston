import { dirname, join } from "node:path";
import { createRolePublisher } from "../agent-role/role-publisher";
import { AgentRoleTracker } from "../agent-role/role-tracker";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { unservedOperations } from "../assistant/served-operations";
import { FileCredentialStore } from "../credentials/file-store";
import { RemoteSharedEndpointStore } from "../credentials/remote-shared-endpoint-store";
import { RemoteCredentialStore } from "../credentials/remote-store";
import { EnvCredentialVault } from "../credentials/vault";
import { HttpDocShadow } from "../docs/http-shadow";
import { DocShadowProjector } from "../docs/projector";
import { BusEventHub } from "../events/hub";
import { LocalPaths } from "../paths";
import {
  type AssistantWiring,
  assistantOperationsServedHere,
  resolveAssistantGateway,
} from "../routes/assistant-wiring";
import { listRoutes } from "../routes/registry/all";
import { LocalWorkspaceStore } from "../store/local";
import { SharedMirrorController } from "../store-sync";
import { BootTelemetry } from "../telemetry/boot";
import { HttpTranscriptShadow } from "../transcripts/http-shadow";
import { MemoryTurnBus } from "../turn/bus";
import { FrameForwarder } from "../turn/frame-forwarder";
import { StandingFrameCapture } from "../turn/standing-frame-capture";
import { HttpTurnLogSender } from "../turn/turn-log-http";
import { LocalUploadSessions } from "../uploads/local";
import { createHostFiles } from "./host-files";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";

export function createHostBase(opts: LocalHostOptions) {
  const store = new LocalWorkspaceStore(opts.workspacesRoot, LOCAL_USER);
  const { vfs, syncDaemon } = createHostFiles(opts);
  const paths = new LocalPaths();
  const uploadSessions = opts.gatewayFronted
    ? undefined
    : new LocalUploadSessions(
        join(
          opts.houstonHome ?? dirname(opts.workspacesRoot),
          "upload-staging",
        ),
      );
  const bus = new MemoryTurnBus();
  const boot = new BootTelemetry();
  const events = new BusEventHub(bus);
  const vault = new EnvCredentialVault({ secret: opts.token });
  const fileCredentials = new FileCredentialStore(opts.credentialsPath);
  const credentials = opts.credentials
    ? new RemoteCredentialStore({
        baseUrl: opts.credentials.url,
        orgSlug: opts.credentials.orgSlug,
        agentSlug: opts.credentials.agentSlug,
        podToken: opts.credentials.podToken,
        fallback: fileCredentials,
      })
    : fileCredentials;
  const sharedEndpoints = opts.sharedEndpoints
    ? new RemoteSharedEndpointStore({
        baseUrl: opts.sharedEndpoints.url,
        orgSlug: opts.sharedEndpoints.orgSlug,
        agentSlug: opts.sharedEndpoints.agentSlug,
        podToken: opts.sharedEndpoints.podToken,
      })
    : undefined;
  const sharedMirrorDir = opts.sharedMirror?.mirrorDir;
  const sharedMirror = opts.sharedMirror
    ? new SharedMirrorController({
        ...opts.sharedMirror,
        log: severityLog,
      })
    : undefined;
  const controlPlaneUrl = `http://127.0.0.1:${opts.port}`;
  const assistantWiring: AssistantWiring = opts.gatewayFronted
    ? { gatewayFronted: true }
    : { self: { url: controlPlaneUrl, token: opts.token } };
  const assistantGateway = resolveAssistantGateway(assistantWiring);
  const catalog = processAssistantCatalog();
  const assistantUnserved: ReadonlySet<string> = new Set(
    catalog && assistantOperationsServedHere(assistantWiring)
      ? unservedOperations(catalog, listRoutes())
      : [],
  );
  const transcriptShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpTranscriptShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpDocShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docProjector = docShadow
    ? new DocShadowProjector({ store, vfs, paths, shadow: docShadow })
    : undefined;
  const roleTracker = new AgentRoleTracker({
    store,
    vfs,
    paths,
    announce: (event) => events.emit(LOCAL_USER, event),
    publish:
      docShadow && docProjector
        ? createRolePublisher(docShadow, docProjector)
        : undefined,
  });
  const frameForwarder = opts.durableTurns?.turnLog
    ? new FrameForwarder({
        bus,
        sender: new HttpTurnLogSender({
          gateway:
            opts.durableTurns.turnlogGateway ?? opts.durableTurns.gateway,
        }),
      })
    : undefined;
  const standingFrameCapture = frameForwarder
    ? new StandingFrameCapture(bus, frameForwarder)
    : undefined;

  return {
    store,
    uploadSessions,
    syncDaemon,
    vfs,
    paths,
    bus,
    boot,
    events,
    vault,
    credentials,
    sharedEndpoints,
    sharedMirrorDir,
    sharedMirror,
    controlPlaneUrl,
    assistantWiring,
    assistantGateway,
    assistantUnserved,
    transcriptShadow,
    docShadow,
    docProjector,
    roleTracker,
    frameForwarder,
    standingFrameCapture,
  };
}
