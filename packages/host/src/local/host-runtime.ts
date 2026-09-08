import { join } from "node:path";
import { sharedSkillsDirKey } from "@houston/domain";
import { captureRuntimeCredential } from "../channel/capture-credential";
import { ProxyChannel } from "../channel/proxy";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { ProcessLauncher } from "../launcher/process";
import { runtimeSpawnEnv } from "../launcher/runtime-env";
import { RuntimeProcessSpawner } from "../launcher/runtime-spawner";
import { forward } from "../proxy/route";
import { CredentialServeHealer } from "../routes/credential-healer";
import { syncSharedEndpoint } from "../shared-endpoint/sync";
import { agentDirFor, liveAgentDirFor } from "./agent-dirs";
import { managedBridgeRuntimeEnv } from "./bridge-capability";
import type { createHostBase } from "./host-base";
import type { LocalHostOptions } from "./host-options";

export function createHostRuntime(
  opts: LocalHostOptions,
  base: ReturnType<typeof createHostBase>,
) {
  const {
    store,
    paths,
    vault,
    credentials,
    sharedEndpoints,
    sharedMirrorDir,
    sharedMirror,
    controlPlaneUrl,
    transcriptShadow,
    standingFrameCapture,
  } = base;
  const spawner =
    opts.spawner ??
    new RuntimeProcessSpawner({
      command: opts.runtimeCommand,
      // Extra env per spawned runtime, additive to the per-runtime values the
      // ProcessLauncher sets (workspace dir, data dir, port, tokens). Built
      // from the spec so the assistant ROLE — which the launcher decides per
      // agent — reaches only the coordinator's own child process.
      env: (spec) => ({
        // The managed pod's own credential-gateway coordinates, so a runtime
        // can reach the local-model bridge the gateway fronts for it.
        ...managedBridgeRuntimeEnv(opts.gatewayFronted, opts.credentials),
        ...runtimeSpawnEnv({
          systemPrompt: opts.systemPrompt,
          sidecarBinary: process.env.HOUSTON_SIDECAR_BINARY,
          transcriptDualWrite: Boolean(transcriptShadow),
          shutdownDrainMs: opts.shutdownDrainMs,
          assistantRole: spec.assistantRole ?? null,
        }),
      }),
      onLog: opts.onRuntimeLog,
    });

  // Stale-id fail-closed resolution + the setup-runtime carve-out live in
  // agent-dirs.ts (HOU-827 / HOU-1239) so both behaviors stay unit-tested.
  const agentDir = (id: string) => agentDirFor(opts.workspacesRoot, id);
  const liveAgentDir = (id: string) => liveAgentDirFor(opts.workspacesRoot, id);
  const launcher = new ProcessLauncher({
    spawner,
    workspaceDirFor: (a) => liveAgentDir(a.id),
    dataDirFor: (a) => join(liveAgentDir(a.id), ".houston", "runtime"),
    sharedSkillsDirFor: sharedMirrorDir
      ? () => join(sharedMirrorDir, "skills")
      : opts.gatewayFronted
        ? undefined
        : (a) =>
            join(
              opts.workspacesRoot,
              ...sharedSkillsDirKey(
                paths.sharedRoot({ id: a.workspaceId }),
              ).split("/"),
            ),
    mintToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    // WHICH of this host's runtimes is the personal-assistant coordinator —
    // decided here, where the agent is known, never inside the runtime (a
    // managed pod's assistant is an ordinarily-named agent under /workspace,
    // so its own directory tells it nothing).
    assistantRoleFor: (a) => assistantRuntimeRole({ agentId: a.id }),
    // Connect-once locally too: keyless runtimes fetch a fresh token from this
    // host, so the refresh token never sits in a runtime's environment.
    credentialServing: {
      controlPlaneUrl,
      mintSandboxToken: (a) => vault.sandboxToken(a.workspaceId, a.id),
    },
    afterSpawn:
      opts.gatewayFronted && sharedEndpoints
        ? async (_agent, runtime) => {
            await syncSharedEndpoint({ store: sharedEndpoints, runtime });
          }
        : undefined,
  });

  const channel = new ProxyChannel({
    launcher,
    proxy: { forward },
    credentials,
    // Desktop: clients talk to this host DIRECTLY (no gateway in front to mint
    // or strip identity headers), so an inbound x-houston-acting-as is
    // untrusted client input — never relay it to the runtime; identity is the
    // single local owner. Managed pods (gatewayFronted) ARE gateway-fronted:
    // the gateway minted the header, so relaying it is what lets the runtime's
    // integration calls act as the driving user (C2).
    forwardActingHeader: opts.gatewayFronted ?? false,
    // Anthropic is served back only behind the gateway (routes/credential.ts);
    // elsewhere the runtime's shared login dir holds it (PRODUCT-1644).
    anthropicServedHere: opts.gatewayFronted ?? false,
    beforeTurn: sharedMirror ? () => sharedMirror.beforeTurn() : undefined,
    turnLogCapture: standingFrameCapture,
  });
  // Raised at the top of stop(): a heal reads the runtime's live credential
  // and the drain is about to kill that runtime, so the serve route answers
  // 503 + Retry-After for the rest of the drain instead of erroring per
  // provider (PRODUCT-1672).
  let draining = false;
  const credentialHealer = opts.credentials
    ? new CredentialServeHealer(
        async ({ workspaceId, agentId, provider, actingAs }) => {
          const agent = await store.getAgent(agentId);
          if (!agent || agent.workspaceId !== workspaceId) return false;
          const result = await captureRuntimeCredential({
            endpoint: await launcher.ensureAwake(agent),
            credentials,
            workspaceId,
            provider,
            // Automatic capture: only local-origin credentials. Refresh-bearing
            // OAuth (a fresh login / lost-scrub leftover) and api_keys the
            // runtime attests were NOT serve-written (PRODUCT-1370: heals the
            // pasted Anthropic setup token after a missed capture) — never a
            // served projection, which would resurrect a central disconnect.
            localOriginOnly: true,
            // The member whose serve missed — their runtime file, their row.
            actingAs,
            // AUTOMATIC re-push (no user behind it): fill-only, per the store's
            // maintenance contract. A plain PUT is reserved for a real user
            // (re)connect because it clears the gateway's revocation tombstone
            // (cloud #230) — the healer re-exporting a pod's leftover copy
            // after a recycle was the one resurrection path that survived
            // (PRODUCT-1318).
            ifAbsent: true,
            anthropicServedHere: opts.gatewayFronted ?? false,
          });
          return result.ok;
        },
        undefined,
        undefined,
        () => draining,
      )
    : undefined;

  return {
    launcher,
    channel,
    credentialHealer,
    agentDir,
    liveAgentDir,
    beginDrain: () => {
      draining = true;
    },
  };
}
