import { join } from "node:path";
import {
  getPreference,
  hostTimezone,
  resolveTimezone,
  sharedSkillsDirKey,
} from "@houston/domain";
import { captureRuntimeCredential } from "../channel/capture-credential";
import { nextStepSuggestionsReader } from "../channel/next-step-suggestions";
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
import { LOCAL_USER } from "./host-log";
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
    assistantUnserved,
  } = base;
  const unserved = [...assistantUnserved];
  const spawner =
    opts.spawner ??
    new RuntimeProcessSpawner({
      command: opts.runtimeCommand,
      env: (spec) => ({
        ...managedBridgeRuntimeEnv(opts.gatewayFronted, opts.credentials),
        ...runtimeSpawnEnv({
          systemPrompt: opts.systemPrompt,
          sidecarBinary: process.env.HOUSTON_SIDECAR_BINARY,
          transcriptDualWrite: Boolean(transcriptShadow),
          shutdownDrainMs: opts.shutdownDrainMs,
          assistantRole: spec.assistantRole ?? null,
          unservedOperations: unserved,
        }),
      }),
      onLog: opts.onRuntimeLog,
    });

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
    assistantRoleFor: (a) => assistantRuntimeRole({ agentId: a.id }),
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
    forwardActingHeader: opts.gatewayFronted ?? false,
    anthropicServedHere: opts.gatewayFronted ?? false,
    beforeTurn: sharedMirror ? () => sharedMirror.beforeTurn() : undefined,
    turnLogCapture: standingFrameCapture,
    timezone: async (workspaceId) =>
      opts.gatewayFronted
        ? hostTimezone()
        : resolveTimezone(
            await getPreference(base.vfs, workspaceId, "timezone"),
          ),
    nextStepSuggestions: opts.gatewayFronted
      ? undefined
      : nextStepSuggestionsReader(base.vfs, store, LOCAL_USER),
  });
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
            localOriginOnly: true,
            actingAs,
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
