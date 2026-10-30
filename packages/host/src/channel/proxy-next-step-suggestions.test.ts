import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setPreference } from "@houston/domain";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import type { ChannelCtx } from "../ports";
import { forward } from "../proxy/route";
import { MemoryVfs } from "../vfs";
import {
  NEXT_STEP_SUGGESTIONS_PREFERENCE,
  type NextStepSuggestionsReader,
  nextStepSuggestionsReader,
} from "./next-step-suggestions";
import { ProxyChannel } from "./proxy";

const ws: Workspace = {
  id: "Personal",
  ownerUserId: "local-owner",
  kind: "personal",
  name: "Personal",
  slug: "personal",
  runtime: "local",
  createdAt: 1,
};
const agent: Agent = {
  id: "Personal/Sol",
  workspaceId: ws.id,
  name: "Sol",
  createdAt: 1,
};
const ctx: ChannelCtx = { workspace: ws, agent };
const personal = { getOrCreatePersonalWorkspace: async () => ws };

let runtime: Server;
let runtimeUrl = "";
let bodies: string[] = [];

beforeAll(async () => {
  runtime = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      bodies.push(body);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});
afterAll(() => runtime.close());
beforeEach(() => {
  bodies = [];
});

function channelReading(read: NextStepSuggestionsReader): ProxyChannel {
  return new ProxyChannel({
    launcher: new FakeLauncher({ baseUrl: runtimeUrl, token: "sbx" }),
    proxy: { forward },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
    nextStepSuggestions: read,
  });
}

async function send(channel: ProxyChannel, body: string): Promise<string> {
  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    void channel.dispatch(ctx, "POST", url.pathname.slice(1), url, req, res);
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  try {
    const port = (s.address() as AddressInfo).port;
    await fetch(`http://127.0.0.1:${port}/conversations/c1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } finally {
    s.close();
  }
  return bodies.at(-1) ?? "";
}

test("with suggestions off, every turn the host hands the runtime says so", async () => {
  const vfs = new MemoryVfs();
  await setPreference(vfs, ws.id, NEXT_STEP_SUGGESTIONS_PREFERENCE, "false");
  const channel = channelReading(
    nextStepSuggestionsReader(vfs, personal, "local-owner"),
  );
  expect(await send(channel, '{"text":"hi","nonce":"n1"}')).toBe(
    '{"text":"hi","nonce":"n1","nextStepSuggestions":false}',
  );
  await channel.fireTurn(ctx, "c1", "run it", undefined, { routine: true });
  expect(JSON.parse(bodies.at(-1) ?? "{}")).toEqual({
    text: "run it",
    nextStepSuggestions: false,
  });
});

test("with suggestions on (or never set), turn bodies travel unchanged", async () => {
  const vfs = new MemoryVfs();
  const channel = channelReading(
    nextStepSuggestionsReader(vfs, personal, "local-owner"),
  );
  expect(await send(channel, '{"text":"hi"}')).toBe('{"text":"hi"}');
  await setPreference(vfs, ws.id, NEXT_STEP_SUGGESTIONS_PREFERENCE, "true");
  await channel.fireTurn(ctx, "c1", "run it");
  expect(JSON.parse(bodies.at(-1) ?? "{}")).toEqual({ text: "run it" });
});

test("a change applies to the very next turn", async () => {
  const vfs = new MemoryVfs();
  const channel = channelReading(
    nextStepSuggestionsReader(vfs, personal, "local-owner"),
  );
  await channel.fireTurn(ctx, "c1", "one");
  await setPreference(vfs, ws.id, NEXT_STEP_SUGGESTIONS_PREFERENCE, "false");
  await channel.fireTurn(ctx, "c1", "two");
  expect(bodies.map((b) => JSON.parse(b).nextStepSuggestions)).toEqual([
    undefined,
    false,
  ]);
});

test("a body that already names the setting (a gateway stamped it) is left alone", async () => {
  const read = vi.fn(async () => false);
  const body = '{"text":"hi","nextStepSuggestions":true}';
  expect(await send(channelReading(read), body)).toBe(body);
  expect(read).not.toHaveBeenCalled();
});

test("an unreadable preference keeps suggestions on and warns", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const broken = {
    getOrCreatePersonalWorkspace: async (): Promise<Workspace> => {
      throw new Error("disk gone");
    },
  };
  const read = nextStepSuggestionsReader(new MemoryVfs(), broken, "x");
  await channelReading(read).fireTurn(ctx, "c1", "run it");
  expect(JSON.parse(bodies.at(-1) ?? "{}")).toEqual({ text: "run it" });
  expect(warn).toHaveBeenCalledWith(
    "[next-step-suggestions] preference unreadable; this turn keeps them on",
    expect.any(Error),
  );
  warn.mockRestore();
});
