import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSISTANT_AGENT_ID, SEED_AGENT_ID, SEED_WORKSPACE_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };

interface UserFrameData {
  content: string;
  ts: number;
  nonce?: string;
  mentions?: Array<{ userId: string; name?: string }>;
}

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

  it("keeps the manager's address off the roster, so an empty roster still has one", async () => {
    await fetch(`${host.url}/agents/${SEED_AGENT_ID}`, { method: "DELETE" });
    const roster = (await (await fetch(`${host.url}/agents`)).json()) as {
      id: string;
    }[];
    expect(roster).toEqual([]);

    const res = await fetch(`${host.url}/v1/assistant`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agent: ASSISTANT_AGENT_ID,
      conversation: "assistant",
    });
  });

  it("refuses a rename onto a name already in use, like the real host", async () => {
    const files = `${host.url}/agents/${SEED_AGENT_ID}/files`;
    await fetch(`${files}/import`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        files: [{ name: "notes.txt", contentBase64: "" }],
      }),
    });

    const res = await fetch(`${files}/rename`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "notes.txt", newName: "Q3 report.pdf" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: '"Q3 report.pdf" already exists there',
      code: "name_taken",
    });

    const listed = (await (await fetch(files)).json()) as Array<{
      path: string;
    }>;
    const paths = listed.map((f) => f.path);
    expect(paths).toContain("notes.txt");
    expect(paths).toContain("Q3 report.pdf");

    await fetch(`${files}/folder`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "Papers" }),
    });
    const ontoFolder = await fetch(`${files}/rename`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "notes.txt", newName: "Papers" }),
    });
    expect(ontoFolder.status).toBe(409);

    const free = await fetch(`${files}/rename`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "notes.txt", newName: "notes 2.txt" }),
    });
    expect(free.status).toBe(200);
    const same = await fetch(`${files}/rename`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "notes 2.txt", newName: "notes 2.txt" }),
    });
    expect(same.status).toBe(200);
  });

  it("refuses a folder or a move onto a name already in use, like the real host", async () => {
    const files = `${host.url}/agents/${SEED_AGENT_ID}/files`;
    const post = (sub: string, payload: Record<string, unknown>) =>
      fetch(`${files}/${sub}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
    await post("import", {
      files: [{ name: "notes.txt", contentBase64: "" }],
    });
    await post("folder", { path: "Papers" });
    await post("import", {
      dir: "Papers",
      files: [{ name: "notes.txt", contentBase64: "" }],
    });

    const folderOntoFile = await post("folder", { path: "notes.txt" });
    expect(folderOntoFile.status).toBe(409);
    expect(await folderOntoFile.json()).toEqual({
      error: '"notes.txt" already exists there',
      code: "name_taken",
    });

    const moveOntoFile = await post("move", {
      path: "notes.txt",
      toDir: "Papers",
    });
    expect(moveOntoFile.status).toBe(409);
    expect(await moveOntoFile.json()).toEqual({
      error: '"notes.txt" already exists there',
      code: "name_taken",
    });

    const listed = (await (await fetch(files)).json()) as Array<{
      path: string;
    }>;
    expect(listed.map((f) => f.path)).toEqual(
      expect.arrayContaining(["notes.txt", "Papers/notes.txt"]),
    );
    const free = await post("move", { path: "notes.txt", toDir: "Archive" });
    expect(free.status).toBe(200);
  });

  it("refuses every write once a workspace is armed read-only", async () => {
    const files = `${host.url}/agents/${SEED_AGENT_ID}/files`;
    const post = (sub: string, payload: Record<string, unknown>) =>
      fetch(`${files}/${sub}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
    await fetch(`${host.url}/__test__/workspace-read-only`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ agentIds: [SEED_AGENT_ID] }),
    });

    const rename = await post("rename", {
      path: "Q3 report.pdf",
      newName: "Q4 report.pdf",
    });
    expect(rename.status).toBe(403);
    expect(await rename.json()).toEqual({
      error: "this workspace is read-only",
      code: "read_only",
    });
    for (const write of [
      post("folder", { path: "Blocked" }),
      post("move", { path: "Q3 report.pdf", toDir: "Docs" }),
      post("import", {
        files: [{ name: "blocked.txt", contentBase64: "" }],
      }),
      fetch(`${files}?path=Q3%20report.pdf`, { method: "DELETE" }),
    ]) {
      expect((await write).status).toBe(403);
    }

    const paths = (
      (await (await fetch(files)).json()) as Array<{ path: string }>
    ).map((f) => f.path);
    expect(paths).toContain("Q3 report.pdf");
    expect(paths).not.toContain("Blocked");
    expect(paths).not.toContain("blocked.txt");
    expect(paths).not.toContain("Docs/Q3 report.pdf");

    await fetch(`${host.url}/__test__/workspace-read-only`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ agentIds: [] }),
    });
    const after = await post("rename", {
      path: "Q3 report.pdf",
      newName: "Q4 report.pdf",
    });
    expect(after.status).toBe(200);
  });

  it("serves the pi-ai provider catalog at /v1/catalog", async () => {
    const res = await fetch(`${host.url}/v1/catalog`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as Array<{
      id: string;
      auth: string;
      models: Array<{ id: string }>;
    }>;
    expect(catalog.length).toBeGreaterThan(20);
    const ids = catalog.map((p) => p.id);
    for (const id of ["anthropic", "openai-codex", "openrouter"])
      expect(ids).toContain(id);
    const totalModels = catalog.reduce((n, p) => n + p.models.length, 0);
    expect(totalModels).toBeGreaterThan(100);
  });

  it("serves the pre-agent connect surface at /setup-runtime/*", async () => {
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

    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const reseeded = (await (
      await fetch(`${host.url}/setup-runtime/auth/status`)
    ).json()) as { activeProvider: string | null };
    expect(reseeded.activeProvider).toBeNull();

    const flat = await fetch(`${host.url}/auth/status`);
    expect(flat.status).toBe(404);

    const outside = await fetch(`${host.url}/setup-runtime/settings`);
    expect(outside.status).toBe(404);
    const noExport = await fetch(`${host.url}/setup-runtime/auth/export`);
    expect(noExport.status).toBe(404);
  });

  it("gates the per-agent api-key connect on the real route's rules", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const connect = (body: Record<string, unknown>) =>
      fetch(`${host.url}/agents/${SEED_AGENT_ID}/credential/api-key`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
    const configured = async (provider: string) => {
      const list = (await (
        await fetch(`${host.url}/agents/${SEED_AGENT_ID}/providers`)
      ).json()) as Array<{ id: string; configured: boolean }>;
      return list.find((p) => p.id === provider)?.configured;
    };

    const ok = await connect({ provider: "openrouter", apiKey: " sk-or-e2e " });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, provider: "openrouter" });
    expect(await configured("openrouter")).toBe(true);

    for (const provider of ["anthropic", "github-copilot", "not-a-provider"]) {
      const res = await connect({ provider, apiKey: "sk-whatever" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "unknown API-key provider" });
    }
    expect(await configured("github-copilot")).toBe(false);
    const noProvider = await connect({ apiKey: "sk-whatever" });
    expect(noProvider.status).toBe(400);
    expect(await noProvider.json()).toEqual({
      error: "unknown API-key provider",
    });

    for (const apiKey of ["", "   \t ", 42]) {
      const res = await connect({ provider: "openrouter", apiKey });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "missing 'apiKey'" });
    }
  });

  it("exposes the __test__ reset control endpoint", async () => {
    const res = await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves + round-trips the per-workspace sidebar layout", async () => {
    const base = `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`;

    const initial = await fetch(base);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      groups: [],
      order: [],
    });

    const layout = {
      groups: [
        { id: "g1", name: "Work", collapsed: false, agentIds: ["a", "b"] },
      ],
      order: [
        { kind: "agent", id: "c" },
        { kind: "group", id: "g1" },
      ],
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
    const oldShape = await fetch(
      `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: [], ungroupedOrder: [] }),
      },
    );
    expect(oldShape.status).toBe(400);
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

    const dismissed = await fetch(
      `${agentBase}/conversations/conv-1/dismiss-interaction`,
      { method: "POST" },
    );
    expect(dismissed.status).toBe(200);
    expect(await dismissed.json()).toEqual({ ok: true });

    const messages = (await (
      await fetch(`${agentBase}/conversations/conv-1/messages`)
    ).json()) as { messages: Array<{ role: string; stopped?: boolean }> };
    const last = messages.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.stopped).toBe(true);

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

    const empty = await fetch(`${host.url}/v1/org/people`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ people: [] });

    await fetch(`${host.url}/__test__/org`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
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
          {
            userId: "u-carol",
            email: "carol@acme.test",
            role: "user",
            displayName: "ada mendez",
          },
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

    const saved = await putProfile({ displayName: "New Name" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      displayName: "New Name",
      custom: { displayName: true, photoUrl: false },
    });
    expect(await peopleName()).toBe("New Name");

    const cleared = await putProfile({ displayName: null });
    expect(await cleared.json()).toEqual({
      displayName: "Ada Lovelace",
      custom: { displayName: false, photoUrl: false },
    });
    expect(await peopleName()).toBe("Ada Lovelace");

    const blank = await putProfile({ displayName: "   " });
    expect(blank.status).toBe(400);
    expect((await blank.json()) as { error: string }).toHaveProperty("error");
    const insecure = await putProfile({ photoUrl: "http://x" });
    expect(insecure.status).toBe(400);
    expect(await peopleName()).toBe("Ada Lovelace");
  });

  it("a send's mentions persist on history and ride the live user frame", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const convo = `${host.url}/agents/${SEED_AGENT_ID}/conversations/conv-mentions`;
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

    const history = (await (await fetch(`${convo}/messages`)).json()) as {
      messages: Array<{ role: string; mentions?: unknown }>;
    };
    const userMessage = history.messages.find((m) => m.role === "user");
    expect(userMessage?.mentions).toEqual(mentions);

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
    expect(users[0]?.mentions).toEqual([{ userId: "u-ok" }]);
    expect("mentions" in (users[1] ?? {})).toBe(false);
    expect("mentions" in (users[2] ?? {})).toBe(false);
  });

  it("stops cleanly so the port stops accepting connections", async () => {
    const { url } = host;
    await host.stop();
    host = await startFakeHost(0);
    await expect(fetch(url)).rejects.toThrow();
  });
});
