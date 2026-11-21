import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import { type LazyStoreVfs, PrefixedVfs } from "@houston/host/src/vfs";
import type { ObjectMetadata } from "@houston/runtime-client/object-sync";
import { listProviders } from "../ai/providers";
import { listProviderUsage } from "../ai/usage";
import { config } from "../config";
import type { SeedTree } from "./op-seed-tree";

export interface SeedViewSources {
  providers: () => unknown;
  providerUsage: () => Promise<unknown>;
  dataDir: string;
}

export const RUNTIME_VIEW_SOURCES: SeedViewSources = {
  providers: () => listProviders(),
  providerUsage: () => listProviderUsage(),
  dataDir: config.dataDir,
};

const AGENT_STATE_FILES = [
  "settings.json",
  "auth.json",
  "custom-endpoint.json",
];

export interface SeedViewInput {
  prefix: string;
  objects: ObjectMetadata[];
  storeRoot: string;
  tree: SeedTree;
  views: SeedViewSources;
}

export async function computeSeedViews(
  input: SeedViewInput,
  vfs: LazyStoreVfs,
): Promise<[string, unknown][]> {
  const out: [string, unknown][] = [];
  await mkdir(join(input.storeRoot, ...input.tree.workspaceRel.split("/")), {
    recursive: true,
  });
  const skills = await dispatchAgentOp({
    workspacesRoot: join(input.storeRoot, "workspaces"),
    agentId: input.tree.id,
    vfs: new PrefixedVfs(vfs, "workspaces"),
    request: { method: "GET", rest: "skills", triggersEnabled: false },
  });
  if (skills.status === 200) out.push(["skills", JSON.parse(skills.body)]);
  else
    console.error(
      `[op] seed skills view not captured: ${skills.status} prefix=${input.prefix}`,
    );
  const state = AGENT_STATE_FILES.filter((file) =>
    existsSync(join(input.views.dataDir, file)),
  );
  if (state.length > 0) {
    console.warn(
      `[op] seed provider views skipped: worker data dir holds ${state.join(", ")} prefix=${input.prefix}`,
    );
    return out;
  }
  const runtime = posix.join(
    input.prefix,
    input.tree.workspaceRel,
    ".houston",
    "runtime",
  );
  const own = AGENT_STATE_FILES.filter((file) =>
    input.objects.some((o) => o.key === posix.join(runtime, file)),
  );
  if (own.length > 0) {
    console.warn(
      `[op] seed provider views skipped: the agent holds ${own.join(", ")} prefix=${input.prefix}`,
    );
    return out;
  }
  out.push(["providers", input.views.providers()]);
  out.push(["provider_usage", await input.views.providerUsage()]);
  return out;
}
