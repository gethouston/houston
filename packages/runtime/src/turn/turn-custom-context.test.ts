import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import { expect, test } from "vitest";
import { createTurnCustomContext } from "./turn-custom-context";
import type { TurnFilesystem } from "./turn-filesystem";

async function context(customOAuthCallbackUrl?: string) {
  const root = await mkdtemp(join(tmpdir(), "turn-custom-context-"));
  const filesystem = {
    kind: "standing" as const,
    storeRoot: root,
    workspaceRel: "workspaces/Personal/Bob",
    workspaceDir: join(root, "workspaces/Personal/Bob"),
    dataRel: "workspaces/Personal/Bob/.houston/runtime",
    dataDir: join(root, "workspaces/Personal/Bob/.houston/runtime"),
    manifest: new Map(),
    vfs: new FsVfs(root),
    listedObjects: 0,
    skippedObjects: 0,
    generationAware: true,
    immediateWrites: new Set(),
  } satisfies TurnFilesystem;
  return createTurnCustomContext({
    filesystem,
    grantUrl: "https://gateway.test",
    hostToken: "host-secret",
    orgSlug: "org",
    agentSlug: "agent",
    ...(customOAuthCallbackUrl ? { customOAuthCallbackUrl } : {}),
  });
}

test("a turn whose gateway holds sign-in attempts can add sign-in servers", async () => {
  const custom = await context(
    "https://gateway.test/v1/integrations/custom/oauth/callback",
  );
  expect(custom.manager.oauthSupported).toBe(true);
  await custom.dispose();
});

test("a turn without the gateway's callback cannot add sign-in servers", async () => {
  const custom = await context();
  expect(custom.manager.oauthSupported).toBe(false);
  await custom.dispose();
});
