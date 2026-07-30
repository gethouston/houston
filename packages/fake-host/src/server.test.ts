import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID, SEED_WORKSPACE_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };

/** One `user` wire frame's payload, as the conversation stream serves it. */
interface UserFrameData {
  content: string;
  ts: number;
  nonce?: string;
  mentions?: Array<{ userId: string; name?: string }>;
}

/**
 * The payload of the first `user` frame on a conversation stream. Reads the SSE
 * body the way the real client does — split on `\n\n`, keep `data:` lines — and
 * aborts the connection once the frame is in hand.
 */
async function readUserFrame(eventsUrl: string): Promise<UserFrameData> {
  const abort = new AbortController();
  try {
    const res = await fetch(eventsUrl, { signal: abort.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before a user frame arrived");
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf("\n\n");
      while (split >= 0) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const data = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (data) {
          const frame = JSON.parse(data.slice(6)) as {
            type: string;
            data: unknown;
          };
          if (frame.type === "user") return frame.data as UserFrameData;
        }
        split = buffer.indexOf("\n\n");
      }
    }
  } finally {
    abort.abort();
  }
}

/**
 * Covers the package's new lifecycle surface — `startFakeHost` / `FakeHost.stop`
 * — and a few representative routes, so the exported API is exercised outside
 * the Playwright suite. Each test binds an ephemeral port (0) to stay hermetic.
 */
describe("startFakeHost", () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = await startFakeHost(0);
  });

  afterEach(async () => {
    await host.stop();
  });

  it("binds an ephemeral port and reports its url", () => {
    expect(host.port).toBeGreaterThan(0);
    expect(host.url).toBe(`http://localhost:${host.port}`);
  });

  it("answers the health probe", async () => {
    const res = await fetch(`${host.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "e2e" });
  });

  it("serves the seeded agent and the local capabilities", async () => {
    const agents = (await (await fetch(`${host.url}/agents`)).json()) as Array<{
      id: string;
    }>;
    expect(agents.map((a) => a.id)).toContain(SEED_AGENT_ID);

    const caps = (await (
      await fetch(`${host.url}/v1/capabilities`)
    ).json()) as {
      profile: string;
      providers: string[];
      sharedSkills: boolean;
    };
    expect(caps.profile).toBe("local");
    expect(caps.providers).toContain("anthropic");
    expect(caps.sharedSkills).toBe(true);
  });

  it("serves the pi-ai provider catalog at /v1/catalog", async () => {
    // Regression: the route was missing, so the app's `getCatalog()` 404-degraded
    // to `[]` and the picker/AI-Models tab fell back to the override-only seed
    // (all providers, zero models). It must serve the real `ProviderCatalog` the
    // desktop host would — every runnable provider, each with its models.
    const res = await fetch(`${host.url}/v1/catalog`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as Array<{
      id: string;
      auth: string;
      models: Array<{ id: string }>;
    }>;
    // The local profile serves the full pi-ai set — many providers, real models.
    expect(catalog.length).toBeGreaterThan(20);
    const ids = catalog.map((p) => p.id);
    for (const id of ["anthropic", "openai-codex", "openrouter"])
      expect(ids).toContain(id);
    const totalModels = catalog.reduce((n, p) => n + p.models.length, 0);
    expect(totalModels).toBeGreaterThan(100);
  });

  it("serves the pre-agent connect surface at /setup-runtime/*", async () => {
    // Regression: the WebApp gate probes /setup-runtime/auth/status (the real
    // host serves no flat /auth/status — commit cfd61df0). The route was
    // missing here, so global-setup timed out waiting for "Your Agents".
    // The setup slot models FIRST-RUN: nothing connected yet — the gate is
    // reachability-only, and onboarding's connect step renders a Connect pill
    // per provider (onboarding-connect.spec asserts "Connect Anthropic").
    const status = await fetch(`${host.url}/setup-runtime/auth/status`);
    expect(status.status).toBe(200);
    const auth = (await status.json()) as {
      providers: Array<{ provider: string; configured: boolean }>;
      activeProvider: string | null;
    };
    expect(auth.activeProvider).toBeNull();
    expect(auth.providers.every((p) => !p.configured)).toBe(true);

    const providers = await fetch(`${host.url}/setup-runtime/providers`);
    expect(providers.status).toBe(200);
    const list = (await providers.json()) as Array<{
      id: string;
      configured: boolean;
    }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => !p.configured)).toBe(true);

    // The OAuth login chain flips the slot both reads share.
    const login = await fetch(
      `${host.url}/setup-runtime/auth/openai-codex/login`,
      { method: "POST" },
    );
    expect(login.status).toBe(200);
    const complete = await fetch(
      `${host.url}/setup-runtime/auth/openai-codex/login/complete`,
      { method: "POST" },
    );
    expect(complete.status).toBe(200);
    const after = (await (
      await fetch(`${host.url}/setup-runtime/auth/status`)
    ).json()) as {
      providers: Array<{ provider: string; configured: boolean }>;
    };
    expect(
      after.providers.find((p) => p.provider === "openai-codex")?.configured,
    ).toBe(true);
    const setupAfter = (await (
      await fetch(`${host.url}/setup-runtime/providers`)
    ).json()) as Array<{ id: string; configured: boolean }>;
    expect(setupAfter.find((p) => p.id === "openai-codex")?.configured).toBe(
      true,
    );

    // reset() empties the setup slot again (what onboarding specs rely on).
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const reseeded = (await (
      await fetch(`${host.url}/setup-runtime/auth/status`)
    ).json()) as { activeProvider: string | null };
    expect(reseeded.activeProvider).toBeNull();

    // The real host serves no flat /auth/status — neither does the fake.
    const flat = await fetch(`${host.url}/auth/status`);
    expect(flat.status).toBe(404);

    // Anything outside the connect surface stays agent-scoped — 404, like the
    // real host's allowlist (packages/host/src/routes/setup-runtime.ts).
    const outside = await fetch(`${host.url}/setup-runtime/settings`);
    expect(outside.status).toBe(404);
    const noExport = await fetch(`${host.url}/setup-runtime/auth/export`);
    expect(noExport.status).toBe(404);
  });

  it("exposes the __test__ reset control endpoint", async () => {
    const res = await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves + round-trips the per-workspace sidebar layout", async () => {
    const base = `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`;

    // Unset → the empty default (mirrors the real host's DEFAULT_SIDEBAR_LAYOUT).
    const initial = await fetch(base);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      groups: [],
      ungroupedOrder: [],
    });

    // A valid PUT persists and echoes the stored layout.
    const layout = {
      groups: [
        { id: "g1", name: "Work", collapsed: false, agentIds: ["a", "b"] },
      ],
      ungroupedOrder: ["c"],
    };
    const put = await fetch(base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(layout),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual(layout);
    expect(await (await fetch(base)).json()).toEqual(layout);
  });

  it("rejects a malformed sidebar layout with 400", async () => {
    const res = await fetch(
      `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: "nope" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("404s a sidebar layout for an unknown workspace", async () => {
    const res = await fetch(`${host.url}/v1/workspaces/ghost/sidebar-layout`);
    expect(res.status).toBe(404);
  });

  it("round-trips workspace-shared skills and per-agent manifests", async () => {
    const sharedBase = `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/shared-skills`;
    const created = await fetch(sharedBase, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "Brand Voice",
        description: "Use our voice",
        content: "## Procedure\nWrite clearly.",
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      name: "brand-voice",
      description: "Use our voice",
    });
    expect(await (await fetch(sharedBase)).json()).toMatchObject({
      items: [{ name: "brand-voice" }],
      diagnostics: [],
    });

    const detailUrl = `${sharedBase}/brand-voice`;
    const savedContent =
      "---\nname: brand-voice\ndescription: Updated\nversion: 2\n---\n\nNew body.\n";
    expect(
      (
        await fetch(detailUrl, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ content: savedContent }),
        })
      ).status,
    ).toBe(200);
    expect(await (await fetch(detailUrl)).json()).toMatchObject({
      name: "brand-voice",
      description: "Updated",
      version: 2,
      content: savedContent,
    });

    const manifestUrl = `${host.url}/agents/${SEED_AGENT_ID}/skills-manifest`;
    expect(await (await fetch(manifestUrl)).json()).toEqual({
      version: 1,
      enabled: [],
    });
    const manifest = await fetch(manifestUrl, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        version: 99,
        enabled: ["research", "brand-voice", "research", 42],
      }),
    });
    expect(await manifest.json()).toEqual({
      version: 1,
      enabled: ["brand-voice", "research"],
    });

    expect((await fetch(detailUrl, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(detailUrl)).status).toBe(404);
  });

  it("dismiss-interaction stops the transcript and clears the activity", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const agentBase = `${host.url}/agents/${SEED_AGENT_ID}`;
    const interaction = {
      steps: [
        {
          kind: "question",
          id: "q1",
          question: "Should I send the draft?",
          toolkit: "gmail",
          options: [
            { id: "send", label: "Send it", recommended: true },
            { id: "dont", label: "Don't send" },
          ],
        },
      ],
    };

    // Bind a conversation to the seeded activity and persist the question
    // interaction VERBATIM (covers the kind-agnostic PATCH set path).
    const patched = await fetch(`${agentBase}/activities/act-1`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        session_key: "conv-1",
        pending_interaction: interaction,
      }),
    });
    const patchedBody = (await patched.json()) as {
      pending_interaction?: unknown;
    };
    expect(patchedBody.pending_interaction).toEqual(interaction);

    // Dismiss: append the stop marker + retire the pending interaction.
    const dismissed = await fetch(
      `${agentBase}/conversations/conv-1/dismiss-interaction`,
      { method: "POST" },
    );
    expect(dismissed.status).toBe(200);
    expect(await dismissed.json()).toEqual({ ok: true });

    // The transcript ends on a stopped, empty assistant message.
    const messages = (await (
      await fetch(`${agentBase}/conversations/conv-1/messages`)
    ).json()) as { messages: Array<{ role: string; stopped?: boolean }> };
    const last = messages.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.stopped).toBe(true);

    // The board card no longer waits on the user (pending_interaction cleared).
    const activities = (await (
      await fetch(`${agentBase}/activities`)
    ).json()) as {
      items: Array<{ id: string; pending_interaction?: unknown }>;
    };
    const card = activities.items.find((a) => a.id === "act-1");
    expect(card?.pending_interaction).toBeUndefined();
  });

  it("deletes pending_interaction when an activity PATCH sends null", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const url = `${host.url}/agents/${SEED_AGENT_ID}/activities/act-1`;
    const interaction = {
      steps: [{ kind: "question", id: "q1", question: "X?", toolkit: "gmail" }],
    };

    await fetch(url, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ pending_interaction: interaction }),
    });
    // Explicit null clears it — the key is DELETED, not stored as null.
    const cleared = await fetch(url, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ pending_interaction: null }),
    });
    const activity = (await cleared.json()) as Record<string, unknown>;
    expect("pending_interaction" in activity).toBe(false);
  });

  it("serves the space directory at /v1/org/people in the gateway's order", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });

    // No armed roster (personal space / single-player): an empty directory —
    // the route EXISTS, so the client gets no autocomplete without taking the
    // 404 degrade path.
    const empty = await fetch(`${host.url}/v1/org/people`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ people: [] });

    await fetch(`${host.url}/__test__/org`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        // Deliberately shuffled, and none of it in the answer's order: the
        // route must sort, not echo. A member the gateway has no GCIP profile
        // for still appears, but AFTER everyone who has a name.
        members: [
          { userId: "u-ghost", email: "ghost@acme.test", role: "user" },
          {
            userId: "u-bob",
            email: "bob@acme.test",
            role: "user",
            displayName: "Bob Stone",
          },
          {
            userId: "u-self",
            email: "you@acme.test",
            role: "owner",
            displayName: "Ada Lovelace",
            photoUrl: "https://img.test/ada.png",
          },
          // Lower-cased on purpose: the sort folds case, so she lands between
          // the two Adas and Bob, not ahead of every capital letter.
          {
            userId: "u-carol",
            email: "carol@acme.test",
            role: "user",
            displayName: "ada mendez",
          },
          // Same display name as u-self: the userId breaks the tie.
          {
            userId: "u-aaa",
            email: "other.ada@acme.test",
            role: "user",
            displayName: "Ada Lovelace",
          },
          { userId: "u-anon", email: "anon@acme.test", role: "user" },
        ],
      }),
    });

    const res = await fetch(`${host.url}/v1/org/people`);
    expect(res.status).toBe(200);
    // Exactly the gateway's order: named first, case-folded alphabetical,
    // userId breaking a tie; then the unnamed, by userId. Sanitized too — the
    // directory carries no email and no role.
    expect(await res.json()).toEqual({
      people: [
        { userId: "u-aaa", displayName: "Ada Lovelace" },
        {
          userId: "u-self",
          displayName: "Ada Lovelace",
          photoUrl: "https://img.test/ada.png",
        },
        { userId: "u-carol", displayName: "ada mendez" },
        { userId: "u-bob", displayName: "Bob Stone" },
        { userId: "u-anon" },
        { userId: "u-ghost" },
      ],
    });

    // A plain member sees the whole directory — unlike `GET /v1/org`, whose
    // roster the gateway hides from a `user`. Every teammate must be able to
    // @mention their co-members.
    await fetch(`${host.url}/__test__/capabilities`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ multiplayer: true, teams: true, role: "user" }),
    });
    const asMember = (await (
      await fetch(`${host.url}/v1/org/people`)
    ).json()) as { people: unknown[] };
    expect(asMember.people).toHaveLength(6);
    const orgAsMember = (await (await fetch(`${host.url}/v1/org`)).json()) as {
      members?: unknown[];
    };
    expect(orgAsMember.members).toBeUndefined();

    // Non-GET 404s, exactly like its neighbours.
    const post = await fetch(`${host.url}/v1/org/people`, { method: "POST" });
    expect(post.status).toBe(404);
  });

  it("serves + edits the caller's own profile at /v1/me/profile", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const profileUrl = `${host.url}/v1/me/profile`;
    const putProfile = (patch: unknown) =>
      fetch(profileUrl, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      });
    const peopleName = async () => {
      const { people } = (await (
        await fetch(`${host.url}/v1/org/people`)
      ).json()) as { people: Array<{ userId: string; displayName?: string }> };
      return people.find((p) => p.userId === "u-self")?.displayName;
    };

    // Arming the roster seeds the identity-provider profile: the caller's name
    // is the one Google handed over, NOT one they chose (`custom` false).
    await fetch(`${host.url}/__test__/org`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        members: [
          {
            userId: "u-self",
            email: "you@acme.test",
            role: "owner",
            displayName: "Ada Lovelace",
          },
        ],
      }),
    });
    const initial = await fetch(profileUrl);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      displayName: "Ada Lovelace",
      custom: { displayName: false, photoUrl: false },
    });

    // A save overrides it — and REPAINTS the directory the mission faces and
    // the @mention popover read, on their very next request.
    const saved = await putProfile({ displayName: "New Name" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      displayName: "New Name",
      custom: { displayName: true, photoUrl: false },
    });
    expect(await peopleName()).toBe("New Name");

    // An explicit null clears the override back to the provider's value —
    // "use my Google name again" — and the roster follows it back.
    const cleared = await putProfile({ displayName: null });
    expect(await cleared.json()).toEqual({
      displayName: "Ada Lovelace",
      custom: { displayName: false, photoUrl: false },
    });
    expect(await peopleName()).toBe("Ada Lovelace");

    // Junk is refused with a reason, never coerced: a blank name, and a photo
    // that is neither https nor an inline image data URL.
    const blank = await putProfile({ displayName: "   " });
    expect(blank.status).toBe(400);
    expect((await blank.json()) as { error: string }).toHaveProperty("error");
    const insecure = await putProfile({ photoUrl: "http://x" });
    expect(insecure.status).toBe(400);
    // …and the refusals changed nothing.
    expect(await peopleName()).toBe("Ada Lovelace");
  });

  it("a send's mentions persist on history and ride the live user frame", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const convo = `${host.url}/agents/${SEED_AGENT_ID}/conversations/conv-mentions`;
    // Slow the canned reply so the turn is still in flight — its replay buffer
    // intact — when the stream attaches with `?after=0` below.
    await fetch(`${host.url}/__test__/chat-config`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ replyDelayMs: 500 }),
    });

    const mentions = [
      { userId: "u-bob", name: "Bob Stone" },
      { userId: "u-x" },
    ];
    const sent = await fetch(`${convo}/messages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        text: "@Bob Stone please confirm",
        mentions,
      }),
    });
    expect(sent.status).toBe(202);

    // Persisted on the stored user message (a reloaded transcript chips the
    // same teammates the live bubble did).
    const history = (await (await fetch(`${convo}/messages`)).json()) as {
      messages: Array<{ role: string; mentions?: unknown }>;
    };
    const userMessage = history.messages.find((m) => m.role === "user");
    expect(userMessage?.mentions).toEqual(mentions);

    // …and published on the live `user` frame, replayed from seq 0.
    const frame = await readUserFrame(`${convo}/events?after=0`);
    expect(frame.content).toBe("@Bob Stone please confirm");
    expect(frame.mentions).toEqual(mentions);
  });

  it("drops junk mentions and omits the field when a send carries none", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const convo = `${host.url}/agents/${SEED_AGENT_ID}/conversations/conv-junk`;

    await fetch(`${convo}/messages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        text: "hello",
        mentions: [
          { name: "No id at all" },
          { userId: "" },
          { userId: 7 },
          "u-string",
          null,
          { userId: "u-ok", name: 42 },
        ],
      }),
    });
    await fetch(`${convo}/messages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ text: "plain", mentions: "not an array" }),
    });
    await fetch(`${convo}/messages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ text: "no sidecar" }),
    });

    const history = (await (await fetch(`${convo}/messages`)).json()) as {
      messages: Array<Record<string, unknown>>;
    };
    const users = history.messages.filter((m) => m.role === "user");
    // Only the one well-formed entry survives, and a non-string `name` is dropped.
    expect(users[0]?.mentions).toEqual([{ userId: "u-ok" }]);
    // A send with junk or no mentions stores the pre-feature message verbatim:
    // the key is absent, never an empty array.
    expect("mentions" in (users[1] ?? {})).toBe(false);
    expect("mentions" in (users[2] ?? {})).toBe(false);
  });

  it("stops cleanly so the port stops accepting connections", async () => {
    const { url } = host;
    await host.stop();
    // Re-start on the same ephemeral port for afterEach's stop() to close.
    host = await startFakeHost(0);
    await expect(fetch(url)).rejects.toThrow();
  });
});
