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
  resolveAssistantGateway,
} from "../routes/assistant-wiring";
import { LocalWorkspaceStore } from "../store/local";
import { SharedMirrorController } from "../store-sync";
import { BootTelemetry } from "../telemetry/boot";
import { HttpTranscriptShadow } from "../transcripts/http-shadow";
import { MemoryTurnBus } from "../turn/bus";
import { FrameForwarder } from "../turn/frame-forwarder";
import { StandingFrameCapture } from "../turn/standing-frame-capture";
import { HttpTurnLogSender } from "../turn/turn-log-http";
import { FsVfs } from "../vfs";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";

export function createHostBase(opts: LocalHostOptions) {
  const store = new LocalWorkspaceStore(opts.workspacesRoot, LOCAL_USER);
  const vfs = new FsVfs(opts.workspacesRoot);
  const paths = new LocalPaths();
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
  // The ONE assistant wiring decision for this host, and it is the HOST's
  // alone. Unfronted (desktop, self-host) THIS host serves the routes the
  // operation catalog names and already accepts `opts.token` on every one of
  // them — so it is its own gateway and the family is on with nothing for the
  // user to configure. A gateway-fronted pod passes no self: its gateway stamps
  // the env pair, and its own routes answer for one agent only. Either way the
  // credential stays in this process: a runtime is told its ROLE and reaches
  // operations through `/sandbox/assistant/call` with its own sandbox token.
  const assistantWiring: AssistantWiring = opts.gatewayFronted
    ? {}
    : { self: { url: controlPlaneUrl, token: opts.token } };
  const assistantGateway = resolveAssistantGateway(assistantWiring);
  const transcriptShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpTranscriptShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docShadow = opts.durableTurns?.transcriptDualWrite
    ? new HttpDocShadow({ gateway: opts.durableTurns.gateway })
    : undefined;
  const docProjector = docShadow
    ? new DocShadowProjector({ store, vfs, paths, shadow: docShadow })
    : undefined;
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
    transcriptShadow,
    docShadow,
    docProjector,
    frameForwarder,
    standingFrameCapture,
  };
}
