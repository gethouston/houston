import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { TimingMarks, TurnResult } from "./claim-report";
import type { SeenToken } from "./echo-provider";

export type Agent = "A" | "B";
export const TOKENS = { A: "sk-agent-a", B: "sk-agent-b" } as const;
export const PREFIXES = {
  materialized: { A: "ws/W/agentA", B: "ws/W/agentB" },
  empty: { A: "ws/W-empty/agentA", B: "ws/W-empty/agentB" },
} as const;

async function uploadText(
  store: ObjectStore,
  scratch: string,
  key: string,
  content: string,
): Promise<void> {
  const source = join(scratch, ...key.split("/"));
  await mkdir(dirname(source), { recursive: true });
  await writeFile(source, content);
  await store.upload(source, key);
}

export async function seedVariant(
  store: ObjectStore,
  scratch: string,
  endpoint: string,
  variant: keyof typeof PREFIXES,
  fillerCount: number,
): Promise<void> {
  for (const agent of ["A", "B"] as const) {
    const prefix = PREFIXES[variant][agent];
    await uploadText(
      store,
      scratch,
      `${prefix}/data/settings.json`,
      JSON.stringify({
        activeProvider: "openai-compatible",
        models: { "openai-compatible": "echo" },
        effort: "medium",
      }),
    );
    await uploadText(
      store,
      scratch,
      `${prefix}/data/custom-endpoint.json`,
      JSON.stringify({
        baseUrl: endpoint,
        model: "echo",
        contextWindow: 32768,
      }),
    );
    if (variant === "empty") continue;
    await uploadText(
      store,
      scratch,
      `${prefix}/workspace/secret.txt`,
      `SECRET-${agent}`,
    );
    for (let i = 0; i < fillerCount; i += 1) {
      await uploadText(
        store,
        scratch,
        `${prefix}/workspace/filler-${String(i).padStart(3, "0")}.txt`,
        `${agent}:${i}:small hydration filler\n`,
      );
    }
  }
}

const turnRoots = async () =>
  new Set(
    (await readdir(tmpdir(), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() && entry.name.startsWith("houston-turn-"),
      )
      .map((entry) => join(tmpdir(), entry.name)),
  );

async function observeNewRoot(before: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const roots = await turnRoots();
    const root = [...roots].find((candidate) => !before.has(candidate));
    if (root) return root;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("did not observe the turn's temporary root");
}

async function waitUntilRemoved(root: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!existsSync(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`turn root was not removed: ${root}`);
}

function parseFrames(raw: string): Array<{ type: string; data: unknown }> {
  return raw
    .split("\n\n")
    .flatMap((block) => block.split("\n"))
    .filter((line) => line.startsWith("data: "))
    .map(
      (line) => JSON.parse(line.slice(6)) as { type: string; data: unknown },
    );
}

export async function fireTurn(opts: {
  baseUrl: string;
  prefix: string;
  agent: Agent;
  conversationId: string;
  text: string;
  token: string;
  seenTokens: SeenToken[];
  priorRoot?: string;
}): Promise<TurnResult> {
  const rootsBefore = await turnRoots();
  const tokenStart = opts.seenTokens.length;
  const response = await fetch(`${opts.baseUrl}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: opts.prefix.includes("W-empty") ? "W-empty" : "W",
      agentId: `agent${opts.agent}`,
      conversationId: opts.conversationId,
      text: opts.text,
      gcsPrefix: opts.prefix,
      credential: {
        provider: "openai-compatible",
        access: opts.token,
        expires: Date.now() + 3_600_000,
        kind: "api_key",
      },
    }),
  });
  if (!response.ok) throw new Error(`turn HTTP ${response.status}`);
  const root = await observeNewRoot(rootsBefore);
  const priorRootGone = !opts.priorRoot || !existsSync(opts.priorRoot);
  const frames = parseFrames(await response.text());
  await waitUntilRemoved(root);
  const timingFrame = frames.find((frame) => frame.type === "timings");
  if (!timingFrame) throw new Error("turn returned no timings frame");
  return {
    agent: opts.agent,
    timings: timingFrame.data as TimingMarks,
    tokens: opts.seenTokens.slice(tokenStart).map((seen) => seen.token),
    root,
    priorRootGone,
    frames,
  };
}

export async function storedConversationText(
  store: ObjectStore,
  scratch: string,
  prefix: string,
): Promise<string> {
  const keys = (await store.list(prefix)).filter((key) =>
    key.includes("/data/conversations/"),
  );
  const chunks: string[] = [];
  for (const key of keys) {
    const target = join(scratch, "inspect", ...key.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await store.download(key, target);
    chunks.push(await readFile(target, "utf8"));
  }
  return chunks.join("\n");
}
