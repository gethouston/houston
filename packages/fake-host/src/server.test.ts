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

  it("strips blocking steps and keeps the offers on a move to done", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const url = `${host.url}/agents/${SEED_AGENT_ID}/activities/act-1`;
    const offer = {
      kind: "suggest_actions",
      id: "a1",
      actions: [
        { id: "x", label: "Send it", message: "Send the deck" },
        { id: "y", label: "Draft a note", message: "Draft the note" },
      ],
    };
    await fetch(url, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pending_interaction: {
          steps: [
            { kind: "question", id: "q1", question: "Which deck?" },
            offer,
          ],
        },
      }),
    });

    // Same rule as the real host: the user's move to Done answers the question,
    // the clean-finish offer keeps rendering on the Done card. A MALFORMED
    // interaction riding along on the same patch counts as absent — it must not
    // block the strip (and must never be stored).
    const done = await fetch(url, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        status: "done",
        pending_interaction: { kind: "question", question: "legacy shape" },
      }),
    });
    const activity = (await done.json()) as Record<string, unknown>;
    expect(activity.pending_interaction).toEqual({ steps: [offer] });
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

/** One team on the wire (`AgentTeam` in `@houston-ai/engine-client`). */
interface TeamWire {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  agentSlugs: string[];
  memberCount: number;
  joined: boolean;
  owner: boolean;
  /** Optional in the strict sense: ABSENT on a team with no identity. */
  icon?: string;
  color?: string;
}

/**
 * C13 agent teams. These are the ONLY place the client's assumptions about the
 * teams wire get tested against a server, so each test pins a rule of
 * `cloud/docs/contracts/C13-agent-teams.md` rather than an implementation
 * detail: the EFFECTIVE fields, the role filter on `agentSlugs`, every refusal
 * code, and the reactivity fan-out.
 */
describe("agent teams (C13)", () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = await startFakeHost(0);
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
  });

  afterEach(async () => {
    await host.stop();
  });

  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: JSON_HEADERS,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const arm = (seed: unknown) => send("POST", "/__test__/agent-teams", seed);
  const armCaps = (patch: unknown) =>
    send("POST", "/__test__/capabilities", patch);
  const armOrg = (seed: unknown) => send("POST", "/__test__/org", seed);
  const listTeams = async (): Promise<TeamWire[]> => {
    const res = await fetch(`${host.url}/v1/org/teams`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { teams: TeamWire[] }).teams;
  };
  const teamNamed = async (name: string): Promise<TeamWire> => {
    const team = (await listTeams()).find((t) => t.name === name);
    if (!team) throw new Error(`no team named ${name}`);
    return team;
  };
  const members = async (teamId: string) => {
    const res = await fetch(`${host.url}/v1/org/teams/${teamId}/members`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { members: unknown[] }).members;
  };
  /** A refusal, flattened to what the client's taxonomy actually reads. */
  const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
  });
  /**
   * Watch the reactivity feed while `body` runs, handing it a `nextEvent(act)`
   * that performs one mutation and answers the domain event it fanned out.
   * `sseResponse` registers the listener while the stream is constructed, so
   * once the response resolves no emit can slip past us — but ARM before
   * calling this, since arming fans out too.
   */
  const withEvents = async (
    body: (
      nextEvent: (act: () => Promise<Response>) => Promise<{ type: string }>,
    ) => Promise<void>,
  ) => {
    const abort = new AbortController();
    try {
      const stream = await fetch(`${host.url}/v1/events`, {
        signal: abort.signal,
      });
      const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      await body(async (act) => {
        expect((await act()).status).toBeLessThan(400);
        for (;;) {
          const line = buffer.split("\n").find((l) => l.startsWith("data: "));
          if (line) {
            buffer = buffer.slice(buffer.indexOf(line) + line.length);
            return JSON.parse(line.slice(6)) as { type: string };
          }
          const { value, done } = await reader.read();
          if (done) throw new Error("events stream ended");
          buffer += decoder.decode(value, { stream: true });
        }
      });
    } finally {
      abort.abort();
    }
  };

  it("mints the default team lazily, named after the org, joined by everyone", async () => {
    const teams = await listTeams();
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      name: "Acme",
      isDefault: true,
      sortOrder: 0,
      // Everyone is in the catch-all, and it holds no rows at all — so the
      // count is the SPACE's, never `len(rows)` beside a `joined: true`.
      joined: true,
      memberCount: 1,
      owner: true,
      // A NULL team resolves to the default one: the seeded agent is in it
      // without anybody ever having written a row.
      agentSlugs: [SEED_AGENT_ID],
    });
    // Idempotent: the second read mints nothing new.
    expect((await listTeams())[0]?.id).toBe(teams[0]?.id);
    expect(await members(String(teams[0]?.id))).toEqual([]);
  });

  it("resolves joined, owner and memberCount from the caller's standing", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "user" },
        { userId: "u-bob", role: "user" },
        { userId: "u-cleo", role: "user" },
      ],
    });
    await armCaps({
      multiplayer: true,
      teams: true,
      agentTeams: true,
      role: "user",
    });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        // Design holds an agent the caller can see, which is the ONLY reason a
        // team they hold no row on reaches their listing at all
        // (§Team visibility clause c). It still reads `joined: false` — visible
        // is not subscribed, and that distinction is what this test pins.
        {
          id: "t-design",
          name: "Design",
          members: [{ userId: "u-bob" }],
          agentIds: [SEED_AGENT_ID],
        },
        {
          id: "t-ops",
          name: "Ops",
          members: [{ userId: "u-self", owner: true }, { userId: "u-bob" }],
        },
      ],
    });

    const asMember = await listTeams();
    // The default: everyone is joined to it and its count is the space's.
    expect(asMember[0]).toMatchObject({
      isDefault: true,
      joined: true,
      owner: false,
      memberCount: 3,
    });
    // A team the caller holds no row on: not joined, not owned, and its count
    // is the EXPLICIT rows.
    expect(asMember[1]).toMatchObject({
      name: "Design",
      joined: false,
      owner: false,
      memberCount: 1,
    });
    // An explicit owner grant is independent of org role: a plain member owns
    // exactly the team they were granted.
    expect(asMember[2]).toMatchObject({
      name: "Ops",
      joined: true,
      owner: true,
      memberCount: 2,
    });

    // An org admin owns EVERY team implicitly, without a row existing for it.
    await armCaps({ role: "admin" });
    const asAdmin = await listTeams();
    expect(asAdmin.map((t) => t.owner)).toEqual([true, true, true]);
    expect(asAdmin[1]?.joined).toBe(false);
    // The rows themselves stay EXPLICIT — implicit ownership is never listed.
    expect(await members("t-design")).toEqual([
      { userId: "u-bob", owner: false },
    ]);
  });

  it("filters agentSlugs by the caller's org role", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "owner" },
        { userId: "u-bob", role: "user" },
      ],
      agents: [
        {
          id: "a-mine",
          name: "Mine",
          assignments: [{ userId: "u-self", access: "user" }],
        },
        {
          id: "a-theirs",
          name: "Theirs",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
        { id: "a-everyone", name: "Everyone", everyone: true },
      ],
    });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        {
          id: "t-design",
          name: "Design",
          agentIds: ["a-mine", "a-theirs", "a-everyone"],
        },
      ],
    });

    await armCaps({ multiplayer: true, teams: true, role: "owner" });
    expect((await teamNamed("Design")).agentSlugs).toEqual([
      "a-mine",
      "a-theirs",
      "a-everyone",
    ]);

    // An admin is filtered exactly like a plain member: implicit TEAM ownership
    // must not widen AGENT visibility, or a team becomes a side channel onto
    // the space's whole roster.
    for (const role of ["admin", "user"]) {
      await armCaps({ role });
      expect((await teamNamed("Design")).agentSlugs).toEqual([
        "a-mine",
        "a-everyone",
      ]);
    }
  });

  it("creates a team owned by its creator, sorted after the current last", async () => {
    // A plain member may create — a team is a grouping, not a grant.
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    const res = await send("POST", "/v1/org/teams", { name: "  Design  " });
    expect(res.status).toBe(201);
    const created = (await res.json()) as TeamWire;
    expect(created).toMatchObject({
      name: "Design",
      isDefault: false,
      joined: true,
      owner: true,
      memberCount: 1,
      agentSlugs: [],
    });
    // After the current last, so it lands at the bottom of the rail.
    const teams = await listTeams();
    expect(teams.map((t) => t.name)).toEqual(["Acme", "Design"]);
    expect(created.sortOrder).toBeGreaterThan(Number(teams[0]?.sortOrder));
    // The creator's ownership is an EXPLICIT row (they are no org admin).
    expect(await members(created.id)).toEqual([
      { userId: "u-self", owner: true },
    ]);
  });

  it("refuses a nameless or over-long team with invalid_name", async () => {
    for (const name of ["", "   ", 42, undefined, "🙂".repeat(61)]) {
      expect(
        await refusal(await send("POST", "/v1/org/teams", { name })),
      ).toEqual({ status: 400, code: "invalid_name" });
    }
    // 60 RUNES, not 60 UTF-16 units: the cap counts what the user typed.
    const ok = await send("POST", "/v1/org/teams", { name: "🙂".repeat(60) });
    expect(ok.status).toBe(201);
    // The patch path follows the same rule, and `sortOrder` must be a number.
    const team = (await ok.json()) as TeamWire;
    expect(
      await refusal(
        await send("PATCH", `/v1/org/teams/${team.id}`, { name: " " }),
      ),
    ).toEqual({ status: 400, code: "invalid_name" });
    expect(
      await refusal(
        await send("PATCH", `/v1/org/teams/${team.id}`, { sortOrder: "3" }),
      ),
    ).toEqual({ status: 400, code: "invalid_sort_order" });
    // A partial patch leaves the untouched field alone.
    const patched = await send("PATCH", `/v1/org/teams/${team.id}`, {
      name: "Renamed",
    });
    expect(await patched.json()).toMatchObject({
      name: "Renamed",
      sortOrder: team.sortOrder,
    });
  });

  it("styles a team on create, and omits an identity it never got", async () => {
    // A styled create is ONE round trip: `icon`/`color` are optional here and
    // policed exactly as they are on PATCH.
    const res = await send("POST", "/v1/org/teams", {
      name: "Design",
      icon: "pen-tool",
      color: "#5E6AD2",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      icon: "pen-tool",
      color: "#5E6AD2",
    });

    // SHAPE only, but the shape is enforced: an icon is a lowercase glyph NAME
    // (never an image), and a colour is `#rrggbb` or a theme token.
    expect(
      await refusal(
        await send("POST", "/v1/org/teams", { name: "Bad", icon: "PenTool" }),
      ),
    ).toEqual({ status: 400, code: "invalid_icon" });
    expect(
      await refusal(
        await send("POST", "/v1/org/teams", { name: "Bad", color: "#5E6AD" }),
      ),
    ).toEqual({ status: 400, code: "invalid_color" });

    // `""` on create means "no identity", and unset is ABSENT from the wire —
    // never `""`, because "render your own default" is a different instruction
    // from "render this empty string".
    const bare = await send("POST", "/v1/org/teams", {
      name: "Bare",
      icon: "",
      color: "",
    });
    expect(bare.status).toBe(201);
    const wire = (await bare.json()) as TeamWire;
    expect(Object.hasOwn(wire, "icon")).toBe(false);
    expect(Object.hasOwn(wire, "color")).toBe(false);
  });

  it("sets identity on patch, clears it with an empty string, and refuses null", async () => {
    const team = (await teamNamed("Acme")).id;
    const patch = (body: unknown) =>
      send("PATCH", `/v1/org/teams/${team}`, body);

    // Identity is a RENAME, not a structural change, so the DEFAULT team is
    // stylable exactly like any other.
    expect((await patch({ icon: "rocket", color: "#5E6AD2" })).status).toBe(
      200,
    );
    expect(await teamNamed("Acme")).toMatchObject({
      icon: "rocket",
      color: "#5E6AD2",
    });
    // Both colour spellings are accepted: a literal hex, or a theme TOKEN name
    // the app resolves. Which tokens exist is the client's vocabulary.
    expect((await patch({ color: "indigo-500" })).status).toBe(200);
    expect((await teamNamed("Acme")).color).toBe("indigo-500");

    // `""` CLEARS the field back to unset — without that spelling a client
    // could set an icon and never take it off. The field goes ABSENT again.
    expect((await patch({ icon: "" })).status).toBe(200);
    const cleared = await teamNamed("Acme");
    expect(Object.hasOwn(cleared, "icon")).toBe(false);
    // A partial patch leaves the field it never named alone.
    expect(cleared.color).toBe("indigo-500");

    // `null` is NOT a clear: there is ONE way to erase a field and it is `""`,
    // exactly as `{"name": null}` is a 400 rather than a rename to nothing.
    expect(await refusal(await patch({ icon: null }))).toEqual({
      status: 400,
      code: "invalid_icon",
    });
    expect(await refusal(await patch({ color: null }))).toEqual({
      status: 400,
      code: "invalid_color",
    });
    // Neither field is TRIMMED, unlike `name`: these are tokens a client
    // generates, so whitespace in one is a client bug worth a 400 — and
    // trimming would quietly turn `"   "` into a clear.
    for (const icon of [" rocket", "rocket ", "   "]) {
      expect(await refusal(await patch({ icon }))).toEqual({
        status: 400,
        code: "invalid_icon",
      });
    }
    // The refused patches changed nothing.
    expect((await teamNamed("Acme")).color).toBe("indigo-500");
  });

  it("gates identity behind the rename gate, not a structural one", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "user" },
        { userId: "u-bob", role: "user" },
      ],
    });
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        {
          id: "t-design",
          name: "Design",
          members: [{ userId: "u-self" }, { userId: "u-bob", owner: true }],
        },
      ],
    });
    // Whoever may RENAME the team may style it — and whoever may not, may not.
    expect(
      await refusal(
        await send("PATCH", "/v1/org/teams/t-design", { icon: "pen-tool" }),
      ),
    ).toEqual({ status: 403, code: "not_team_owner" });
    // Standing is settled before the body: an unstylable team never reports
    // WHICH of its fields was malformed.
    expect(
      await refusal(
        await send("PATCH", "/v1/org/teams/t-design", { icon: "NOPE" }),
      ),
    ).toEqual({ status: 403, code: "not_team_owner" });

    // An org admin owns every team implicitly, the default one included.
    await armCaps({ role: "admin" });
    expect(
      (await send("PATCH", "/v1/org/teams/t-default", { icon: "rocket" }))
        .status,
    ).toBe(200);
    expect((await teamNamed("Acme")).icon).toBe("rocket");
  });

  it("serves a member the teams they are part of, and an admin every team", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "user" },
        { userId: "u-bob", role: "user" },
      ],
      agents: [
        {
          id: "a-mine",
          name: "Mine",
          assignments: [{ userId: "u-self", access: "user" }],
        },
        {
          id: "a-theirs",
          name: "Theirs",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
      ],
    });
    await armCaps({
      multiplayer: true,
      teams: true,
      agentTeams: true,
      role: "user",
    });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-mine", name: "Mine", members: [{ userId: "u-self" }] },
        { id: "t-agent", name: "Agent", agentIds: ["a-mine"] },
        {
          id: "t-strangers",
          name: "Strangers",
          members: [{ userId: "u-bob" }],
          agentIds: ["a-theirs"],
        },
      ],
    });

    // The catch-all everyone is in, the team they were put in, and the team
    // holding an agent they can see — an assigned agent must never orphan off
    // the rail because somebody filed it elsewhere. "Strangers" is neither, so
    // it costs this member nothing. The filter only DROPS rows, so what is left
    // is in the order it always was.
    const seen = await listTeams();
    expect(seen.map((t) => t.name)).toEqual(["Acme", "Mine", "Agent"]);
    // Kept by the AGENT clause alone: visible, not subscribed.
    expect(seen[2]).toMatchObject({ joined: false, agentSlugs: ["a-mine"] });

    // Only the LISTING filters: a member holding a hidden team's id can still
    // read its roster. A team is not an access object and grants nothing, so
    // there is nothing here to leak.
    expect(await members("t-strangers")).toEqual([
      { userId: "u-bob", owner: false },
    ]);

    // An org admin owns every team implicitly, so a team hidden from them would
    // be one nobody could administer. Their listing is the full directory.
    for (const role of ["admin", "owner"]) {
      await armCaps({ role });
      expect((await listTeams()).map((t) => t.name)).toEqual([
        "Acme",
        "Mine",
        "Agent",
        "Strangers",
      ]);
    }
  });

  it("joins idempotently, never demotes an owner, and no-ops on the default team", async () => {
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-design", name: "Design" },
        {
          id: "t-ops",
          name: "Ops",
          members: [{ userId: "u-self", owner: true }],
        },
      ],
    });

    expect((await send("POST", "/v1/org/teams/t-design/join")).status).toBe(
      204,
    );
    expect((await send("POST", "/v1/org/teams/t-design/join")).status).toBe(
      204,
    );
    expect(await members("t-design")).toEqual([
      { userId: "u-self", owner: false },
    ]);
    // Re-joining a team you already own must not demote you to a plain member.
    expect((await send("POST", "/v1/org/teams/t-ops/join")).status).toBe(204);
    expect(await members("t-ops")).toEqual([{ userId: "u-self", owner: true }]);
    // The default team is a no-op: everyone is already in it, and a row there
    // is one the remove path could never delete.
    expect((await send("POST", "/v1/org/teams/t-default/join")).status).toBe(
      204,
    );
    expect(await members("t-default")).toEqual([]);
  });

  it("refuses a default-team MEMBER write with default_team, ahead of the ownership gate", async () => {
    // A plain member with no rows: were the gates ordered the other way round,
    // each of these would answer `not_team_owner` instead. The default team
    // holds no explicit rows AT ALL, so there is nothing an owner could act on
    // either — the team's own nature is the whole answer, whoever is asking,
    // and answering `not_team_owner` would promise a permission that leads
    // nowhere.
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    const id = (await listTeams())[0]?.id;
    expect(
      await refusal(await send("DELETE", `/v1/org/teams/${id}/members/u-self`)),
    ).toEqual({ status: 400, code: "default_team" });
    expect(
      await refusal(
        await send("PUT", `/v1/org/teams/${id}/members/u-self`, {
          owner: true,
        }),
      ),
    ).toEqual({ status: 400, code: "default_team" });
    // And an org owner meets the same wall: the refusal is about the TEAM.
    await armCaps({ role: "owner" });
    expect(
      await refusal(
        await send("PUT", `/v1/org/teams/${id}/members/u-self`, {
          owner: true,
        }),
      ),
    ).toEqual({ status: 400, code: "default_team" });
  });

  it("answers a non-owner DELETEing the default team not_team_owner, not default_team", async () => {
    // DELETE is the asymmetry: the caller's STANDING is settled before the
    // team's own nature, so a stranger learns "not yours" and never a detail
    // about the shape of a space they hold no authority in.
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    const id = (await listTeams())[0]?.id;
    expect(await refusal(await send("DELETE", `/v1/org/teams/${id}`))).toEqual({
      status: 403,
      code: "not_team_owner",
    });
    // Somebody who COULD delete a team gets past that gate, and only then meets
    // the one thing about this team that makes it undeletable.
    await armCaps({ role: "owner" });
    expect(await refusal(await send("DELETE", `/v1/org/teams/${id}`))).toEqual({
      status: 400,
      code: "default_team",
    });
  });

  it("refuses a non-owner's team mutations with not_team_owner", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "user" },
        { userId: "u-bob", role: "user" },
      ],
    });
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        {
          id: "t-design",
          name: "Design",
          members: [{ userId: "u-self" }, { userId: "u-bob", owner: true }],
        },
      ],
    });
    const gated: Array<[string, string, unknown?]> = [
      ["PATCH", "/v1/org/teams/t-design", { name: "Nope" }],
      ["DELETE", "/v1/org/teams/t-design"],
      ["PUT", "/v1/org/teams/t-design/members/u-bob", { owner: false }],
      ["DELETE", "/v1/org/teams/t-design/members/u-bob"],
    ];
    for (const [method, path, body] of gated) {
      expect(await refusal(await send(method, path, body))).toEqual({
        status: 403,
        code: "not_team_owner",
      });
    }
    // Leaving is always yours to do: self-remove is not a team mutation.
    expect(
      (await send("DELETE", "/v1/org/teams/t-design/members/u-self")).status,
    ).toBe(204);
    // Idempotent: leaving twice still succeeds, so a double-click cannot 404.
    expect(
      (await send("DELETE", "/v1/org/teams/t-design/members/u-self")).status,
    ).toBe(204);
    expect(await members("t-design")).toEqual([
      { userId: "u-bob", owner: true },
    ]);
  });

  it("upserts a member who never joined, and refuses one outside the org", async () => {
    await armOrg({
      members: [
        { userId: "u-self", role: "owner" },
        { userId: "u-bob", role: "user" },
      ],
    });
    await arm({ teams: [{ id: "t-design", name: "Design" }] });

    // The upsert ADDS somebody who never joined the team.
    expect(
      (
        await send("PUT", "/v1/org/teams/t-design/members/u-bob", {
          owner: true,
        })
      ).status,
    ).toBe(204);
    expect(await members("t-design")).toEqual([
      { userId: "u-bob", owner: true },
    ]);
    // Demoting the LAST explicit owner is allowed: implicit owners always exist.
    expect(
      (
        await send("PUT", "/v1/org/teams/t-design/members/u-bob", {
          owner: false,
        })
      ).status,
    ).toBe(204);
    expect(await members("t-design")).toEqual([
      { userId: "u-bob", owner: false },
    ]);
    // The org is the outer boundary, and `owner` must be a boolean.
    expect(
      await refusal(
        await send("PUT", "/v1/org/teams/t-design/members/u-ghost", {
          owner: true,
        }),
      ),
    ).toEqual({ status: 400, code: "not_a_member" });
    expect(
      await refusal(
        await send("PUT", "/v1/org/teams/t-design/members/u-bob", {
          owner: "yes",
        }),
      ),
    ).toEqual({ status: 400, code: "invalid_owner" });
  });

  it("hands a deleted team's agents back to the default team", async () => {
    await armOrg({
      agents: [
        { id: "a-one", name: "One", everyone: true },
        { id: "a-two", name: "Two", everyone: true },
      ],
    });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-design", name: "Design", agentIds: ["a-two"] },
      ],
    });
    expect((await teamNamed("Acme")).agentSlugs).toEqual(["a-one"]);

    expect((await send("DELETE", "/v1/org/teams/t-design")).status).toBe(204);
    // No agent is ever teamless: the orphan resolves to the default team again.
    const teams = await listTeams();
    expect(teams.map((t) => t.id)).toEqual(["t-default"]);
    expect(teams[0]?.agentSlugs).toEqual(["a-one", "a-two"]);
    // Its memberships went with it — the team is gone, not emptied.
    expect(
      await refusal(await fetch(`${host.url}/v1/org/teams/t-design/members`)),
    ).toEqual({ status: 404, code: "team_not_found" });
  });

  it("moves an agent between teams and validates the target", async () => {
    await armOrg({ agents: [{ id: "a-one", name: "One", everyone: true }] });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-design", name: "Design" },
      ],
    });

    expect(
      (await send("PUT", "/v1/agents/a-one/team", { teamId: "t-design" }))
        .status,
    ).toBe(204);
    expect((await teamNamed("Design")).agentSlugs).toEqual(["a-one"]);
    expect((await teamNamed("Acme")).agentSlugs).toEqual([]);
    // Re-issuing the current team is a no-op success, not a conflict.
    expect(
      (await send("PUT", "/v1/agents/a-one/team", { teamId: "t-design" }))
        .status,
    ).toBe(204);

    // An absent/blank/non-string teamId is a MALFORMED request: a 404 would
    // claim the gateway looked something up.
    for (const body of [{}, { teamId: "   " }, { teamId: 7 }]) {
      expect(
        await refusal(await send("PUT", "/v1/agents/a-one/team", body)),
      ).toEqual({ status: 400, code: "invalid_team_id" });
    }
    expect(
      await refusal(
        await send("PUT", "/v1/agents/a-one/team", { teamId: "t-ghost" }),
      ),
    ).toEqual({ status: 404, code: "team_not_found" });
    const unknownAgent = await send("PUT", "/v1/agents/a-ghost/team", {
      teamId: "t-design",
    });
    expect(unknownAgent.status).toBe(404);
    expect(await unknownAgent.json()).toEqual({ error: "agent not found" });
    // The SLUG is resolved before the body is read: an unknown agent 404s even
    // with no `teamId` at all. "Which agent?" is the question this route is
    // addressed to, so a client chasing a stale slug must not be told its body
    // was malformed and retry with a teamId that can never help.
    const ghostNoTeam = await send("PUT", "/v1/agents/a-ghost/team", {});
    expect(ghostNoTeam.status).toBe(404);
    expect(await ghostNoTeam.json()).toEqual({ error: "agent not found" });

    // Ownership of BOTH sides: a plain member owning only the TARGET may not
    // pull an agent out of a team they do not own.
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true, agentIds: [] },
        {
          id: "t-mine",
          name: "Mine",
          members: [{ userId: "u-self", owner: true }],
        },
      ],
    });
    expect(
      await refusal(
        await send("PUT", "/v1/agents/a-one/team", { teamId: "t-mine" }),
      ),
    ).toEqual({ status: 403, code: "not_team_owner" });
  });

  it("answers a same-team move 204 before it asks about ownership, and still fans out", async () => {
    // The caller owns NEITHER side: a plain member with no rows on the team the
    // agent already sits in. A move that changes nothing is not a mutation to
    // authorize — refusing it would teach the client that the state it is
    // already in is forbidden, and a re-drop onto the block an agent never left
    // would spring a "not a team owner" toast out of nowhere.
    await armOrg({ agents: [{ id: "a-one", name: "One", everyone: true }] });
    await armCaps({ multiplayer: true, teams: true, role: "user" });
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-design", name: "Design", agentIds: ["a-one"] },
      ],
    });
    // Proof the ownership gate is armed and would refuse a REAL move.
    expect(
      await refusal(
        await send("PUT", "/v1/agents/a-one/team", { teamId: "t-default" }),
      ),
    ).toEqual({ status: 403, code: "not_team_owner" });

    await withEvents(async (nextEvent) => {
      // The no-op still fans out, exactly like the no-op join: a client that
      // wrote optimistically is reconciled against the server's truth either
      // way, so nothing depends on the write having been consequential.
      const event = await nextEvent(() =>
        send("PUT", "/v1/agents/a-one/team", { teamId: "t-design" }),
      );
      expect(event.type).toBe("AgentsChanged");
    });
    expect((await teamNamed("Design")).agentSlugs).toEqual(["a-one"]);
  });

  it("404s an unknown or malformed team id", async () => {
    for (const path of ["/v1/org/teams/t-ghost", "/v1/org/teams/%zz"]) {
      expect(await refusal(await send("PATCH", path, { name: "X" }))).toEqual({
        status: 404,
        code: "team_not_found",
      });
      expect(await refusal(await send("DELETE", path))).toEqual({
        status: 404,
        code: "team_not_found",
      });
    }
    expect(
      await refusal(await fetch(`${host.url}/v1/org/teams/t-ghost/members`)),
    ).toEqual({ status: 404, code: "team_not_found" });
  });

  it("lets a personal space group its agents exactly like a team space", async () => {
    // The half a personal space MAY do. Teams are how a SOLO user groups their
    // own agents, so the read serves the real list and every grouping write
    // behaves as it does anywhere else; only the default team's own rules bite.
    await armOrg({ agents: [{ id: "a-one", name: "One", everyone: true }] });
    await arm({
      teams: [{ id: "t-default", name: "Acme", isDefault: true }],
      personalSpace: true,
    });
    expect(await listTeams()).toMatchObject([
      { id: "t-default", isDefault: true, joined: true, owner: true },
    ]);

    // Create: the sole human owns what they made, creator row and all.
    const created = await send("POST", "/v1/org/teams", { name: "Design" });
    expect(created.status).toBe(201);
    const design = (await created.json()) as TeamWire;
    expect(design).toMatchObject({ joined: true, owner: true });

    // The listing serves the REAL list — the default team is no longer the
    // only one a personal space can show — and every team in it reads as the
    // one person's own.
    const teams = await listTeams();
    expect(teams.map((t) => t.name)).toEqual(["Acme", "Design"]);
    for (const team of teams)
      expect(team).toMatchObject({ joined: true, owner: true });

    // Rename and reorder, then move an agent between the two teams (ownership
    // of BOTH sides, which the sole owner holds implicitly).
    const patched = await send("PATCH", `/v1/org/teams/${design.id}`, {
      name: "Design Guild",
      sortOrder: 9,
    });
    expect(patched.status).toBe(200);
    expect(
      (await send("PUT", "/v1/agents/a-one/team", { teamId: design.id }))
        .status,
    ).toBe(204);
    expect((await teamNamed("Design Guild")).agentSlugs).toEqual(["a-one"]);
    // The roster READ manages nobody, so it is open here like everywhere else.
    expect(await members(design.id)).toEqual([
      { userId: "u-self", owner: true },
    ]);

    // The default team's own rules are untouched: still undeletable, and it
    // still catches the agents of a team that goes away.
    expect(
      await refusal(await send("DELETE", "/v1/org/teams/t-default")),
    ).toEqual({ status: 400, code: "default_team" });
    expect((await send("DELETE", `/v1/org/teams/${design.id}`)).status).toBe(
      204,
    );
    expect(await listTeams()).toMatchObject([
      { id: "t-default", agentSlugs: ["a-one"] },
    ]);
  });

  it("refuses only the three people routes in a personal space", async () => {
    // The half it may NOT do: manage PEOPLE. One human is in the space, so a
    // membership row there is meaningless and growing past yourself means
    // creating an organization.
    await arm({
      teams: [
        { id: "t-default", name: "Acme", isDefault: true },
        { id: "t-design", name: "Design" },
      ],
      personalSpace: true,
    });

    const people = (teamId: string): Array<[string, string, unknown?]> => [
      ["POST", `/v1/org/teams/${teamId}/join`],
      ["DELETE", `/v1/org/teams/${teamId}/members/u-self`],
      ["PUT", `/v1/org/teams/${teamId}/members/u-self`, { owner: true }],
    ];
    // On the default team and on a created one alike — and on the default team
    // the answer is `personal_space`, NOT `default_team`: "there is nobody to
    // manage" is the accurate answer, where `default_team` would send a client
    // hunting for another team to write to.
    // A team id that does not resolve answers the same, because the refusal
    // lands before the lookup: the space has no people whichever team is named.
    for (const teamId of ["t-default", "t-design", "t-ghost"]) {
      for (const [method, path, body] of people(teamId)) {
        expect(await refusal(await send(method, path, body))).toEqual({
          status: 403,
          code: "personal_space",
        });
      }
    }
    // The roster READ is not people management, and is served. What it serves
    // is the one row a personal-space team ALWAYS has: its creator, as owner.
    // Arming cannot produce a team here that the one human has not joined, so
    // no spec can pass against a state the gateway is unable to reach.
    expect(await members("t-design")).toEqual([
      { userId: "u-self", owner: true },
    ]);
  });

  it("fans out AgentsChanged on every mutation", async () => {
    await withEvents(async (nextEvent) => {
      const created = await nextEvent(() =>
        send("POST", "/v1/org/teams", { name: "Design" }),
      );
      expect(created.type).toBe("AgentsChanged");
      const id = (await teamNamed("Design")).id;
      // Even a no-op join fans out, so a client that wrote optimistically is
      // always reconciled against the server's truth.
      for (const act of [
        () => send("POST", `/v1/org/teams/${id}/join`),
        () => send("PATCH", `/v1/org/teams/${id}`, { sortOrder: 9 }),
        () => send("PUT", `/v1/agents/${SEED_AGENT_ID}/team`, { teamId: id }),
        () => send("DELETE", `/v1/org/teams/${id}`),
      ]) {
        expect((await nextEvent(act)).type).toBe("AgentsChanged");
      }
    });
  });
});
