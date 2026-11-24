import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { QWEN_REGIONS, qwenRegionFileIn } from "../ai/qwen-dashscope";
import { writeAuthFile } from "../auth/auth-file";
import { runWithActingContext } from "../session/acting-context";
import { createTurnModelRuntime, registerTurnProviders } from "./turn-runtime";

test("turn provider registration reads qwen region from the turn dataDir", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "turn-qwen-"));
  writeFileSync(qwenRegionFileIn(dataDir), JSON.stringify({ region: "us" }));
  const registrations: Array<{ id: string; baseUrl?: string }> = [];
  const runtime = {
    registerProvider: (id: string, config: { baseUrl?: string }) => {
      registrations.push({ id, baseUrl: config.baseUrl });
    },
    unregisterProvider: () => {},
    getRegisteredProviderConfig: () => undefined,
  };

  registerTurnProviders(runtime, dataDir);

  expect(registrations).toContainEqual({
    id: "qwen",
    baseUrl: QWEN_REGIONS[1].baseUrl,
  });
});

test("the turn runtime re-serves an expiring Copilot token instead of refreshing with an empty refresh token", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "turn-reserve-"));
  const soon = Date.now() + 60_000;
  writeAuthFile(join(dataDir, "auth.json"), {
    "github-copilot": {
      type: "oauth",
      access: "old",
      refresh: "",
      expires: soon,
    },
  });
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return Response.json({
      provider: "github-copilot",
      kind: "oauth",
      access: "fresh",
      expires: Date.now() + 25 * 60_000,
      scope: "team",
    });
  });
  try {
    const { modelRuntime } = await createTurnModelRuntime(
      dataDir,
      "github-copilot",
    );
    const resolution = await runWithActingContext(
      {
        credentialScopeKey: "u:turn:w:a",
        credentialChannel: {
          baseUrl: "https://gw.example",
          orgSlug: "org-1",
          agentSlug: "agent-1",
          hostToken: "turn-v1.token",
          provider: "github-copilot",
          kind: "oauth",
          scope: "team",
        },
      },
      () => modelRuntime.getAuth("github-copilot"),
    );
    expect(JSON.stringify(resolution)).toContain("fresh");
    expect(urls).toEqual([
      "https://gw.example/v1/pod/credentials/org-1/agent-1/github-copilot",
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("without a channel the turn runtime serves the stored token as-is and posts no refresh", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "turn-mask-"));
  writeAuthFile(join(dataDir, "auth.json"), {
    "github-copilot": {
      type: "oauth",
      access: "old",
      refresh: "",
      expires: Date.now() + 60_000,
    },
  });
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response("{}", { status: 401 });
  });
  try {
    const { modelRuntime } = await createTurnModelRuntime(
      dataDir,
      "github-copilot",
    );
    const resolution = await modelRuntime.getAuth("github-copilot");
    expect(JSON.stringify(resolution)).toContain("old");
    expect(urls).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});
