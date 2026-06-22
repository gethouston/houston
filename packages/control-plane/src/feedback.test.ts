import { test, expect } from "bun:test";
import { createServer, type Server } from "node:http";
import {
  LinearFeedbackSender,
  formatIssueDescription,
  formatIssueTitle,
  parseFeedbackPayload,
  type FeedbackPayload,
} from "./feedback";

/**
 * The web build's "Send feedback" intake. Formatting mirrors the desktop's
 * bug_report/format.rs so web + desktop reports read identically in Linear;
 * the sender speaks Linear's GraphQL (label lookup, then issueCreate).
 */

const payload: FeedbackPayload = {
  command: "user_feedback",
  error: "Error: no workspace found\nsecond line",
  userEmail: "user@example.com",
  timestamp: "2026-06-12T12:00:00.000Z",
  appVersion: "0.4.19",
  logs: { backend: "backend log line", frontend: "frontend log line" },
};

test("title leads with the user's own words when present", () => {
  expect(
    formatIssueTitle({
      ...payload,
      userMessage: "The chat froze   when I asked",
    }),
  ).toBe("Houston feedback: The chat froze when I asked");
  expect(formatIssueTitle({ ...payload, userMessage: "   " })).toBe(
    "Houston bug: user_feedback - Error: no workspace found",
  );
  expect(formatIssueTitle({ ...payload, error: "" })).toBe(
    "Houston bug: user_feedback",
  );
});

test("description carries user words first, then error, context, logs", () => {
  const d = formatIssueDescription(
    { ...payload, userMessage: "it broke" },
    "user-123",
  );
  expect(d.indexOf("it broke")).toBeLessThan(d.indexOf("## Error"));
  expect(d).toContain("- Command: user_feedback");
  expect(d).toContain("- Surface: Houston Web (cloud)");
  expect(d).toContain("- User: user@example.com");
  expect(d).toContain("- User Id: user-123");
  expect(d).toContain("backend log line");
  expect(d).toContain("frontend log line");
});

test("code fences expand past backtick runs in content", () => {
  const d = formatIssueDescription(
    { ...payload, error: "before ``` after", logs: {} },
    "u",
  );
  expect(d).toContain("````text\nbefore ``` after\n````");
});

test("parseFeedbackPayload requires command and bounds every field", () => {
  expect(() => parseFeedbackPayload({})).toThrow("missing 'command'");
  const p = parseFeedbackPayload({
    command: "c".repeat(500),
    error: 42, // non-string → empty, never a crash
    userMessage: "hello",
    logs: { backend: "b", frontend: "f" },
  });
  expect(p.command.length).toBe(200);
  expect(p.error).toBe("");
  expect(p.userMessage).toBe("hello");
  expect(p.logs).toEqual({ backend: "b", frontend: "f" });
});

test("LinearFeedbackSender resolves the label then files the issue", async () => {
  const requests: {
    auth: string | undefined;
    body: { query: string; variables: Record<string, unknown> };
  }[] = [];
  const stub: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({ auth: req.headers.authorization, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (body.query.includes("HoustonBugReportLabel")) {
      res.end(
        JSON.stringify({
          data: {
            team: { labels: { nodes: [{ id: "label-1", name: "User Bug" }] } },
          },
        }),
      );
    } else {
      res.end(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: { id: "i1", identifier: "BUG-42" },
            },
          },
        }),
      );
    }
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()));
  const addr = stub.address();
  const apiUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const sender = new LinearFeedbackSender({
    apiKey: "lin_key",
    teamId: "team-1",
    labelName: "User Bug",
    apiUrl,
  });
  const id = await sender.send(
    { ...payload, userMessage: "deck never downloaded" },
    "user-9",
  );
  expect(id).toBe("BUG-42");
  expect(requests).toHaveLength(2);
  expect(requests.every((r) => r.auth === "lin_key")).toBe(true);
  const req1 = requests[1];
  if (!req1) throw new Error("expected requests[1] to exist");
  const input = req1.body.variables.input as {
    teamId: string;
    labelIds: string[];
    title: string;
    description: string;
  };
  expect(input.teamId).toBe("team-1");
  expect(input.labelIds).toEqual(["label-1"]);
  expect(input.title).toBe("Houston feedback: deck never downloaded");
  expect(input.description).toContain("- User Id: user-9");

  await new Promise<void>((r) => stub.close(() => r()));
});

test("LinearFeedbackSender surfaces GraphQL errors instead of swallowing", async () => {
  const stub: Server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "team not found" }] }));
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()));
  const addr = stub.address();
  const sender = new LinearFeedbackSender({
    apiKey: "k",
    teamId: "t",
    labelName: "User Bug",
    apiUrl: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
  });
  await expect(sender.send(payload, "u")).rejects.toThrow("team not found");
  await new Promise<void>((r) => stub.close(() => r()));
});

// ---------------------------------------------------------------------------
// Route-level: POST /feedback on the control-plane server
// ---------------------------------------------------------------------------

import type { Capabilities } from "@houston/protocol";
import { createControlPlaneServer, type ControlPlaneDeps } from "./server";
import { ProxyChannel } from "./channel/proxy";
import { MemoryWorkspaceStore } from "./store/memory";
import { MemoryCredentialStore } from "./credentials/store";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "./ports";

function routeDeps(feedback?: ControlPlaneDeps["feedback"]): ControlPlaneDeps {
  const verifier: TokenVerifier = {
    async verify(bearer) {
      return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
    },
  };
  const launcher: RuntimeLauncher = {
    async ensureAwake(): Promise<RuntimeEndpoint> {
      return { baseUrl: "http://sandbox.local", token: "t" };
    },
    async sleep() {},
    async destroy() {},
    async status() {
      return "running";
    },
  };
  const credentials = new MemoryCredentialStore();
  const capabilities: Capabilities = {
    profile: "cloud",
    revealInOs: false,
    terminal: false,
    tunnel: false,
    codeExecution: "remote-sandbox",
    providers: ["openai-codex"],
    integrations: [],
  };
  return {
    verifier,
    store: new MemoryWorkspaceStore(),
    credentials,
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {
      gke: new ProxyChannel({
        launcher,
        proxy: { async forward() {} },
        credentials,
      }),
    },
    capabilities,
    feedback,
  };
}

async function listen(
  deps: ControlPlaneDeps,
): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  return {
    base: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("POST /feedback requires auth, 503s unconfigured, files when wired", async () => {
  const sent: { payload: FeedbackPayload; userId: string }[] = [];
  const wired = await listen(
    routeDeps({
      async send(p, userId) {
        sent.push({ payload: p, userId });
        return "BUG-7";
      },
    }),
  );
  const unwired = await listen(routeDeps());

  // No token → 401.
  expect(
    (await fetch(`${wired.base}/feedback`, { method: "POST", body: "{}" }))
      .status,
  ).toBe(401);

  // Not configured → 503 with a real error, never a silent drop.
  const r503 = await fetch(`${unwired.base}/feedback`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: "user_feedback" }),
  });
  expect(r503.status).toBe(503);

  // Bad payload → 400.
  const r400 = await fetch(`${wired.base}/feedback`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  expect(r400.status).toBe(400);

  // Happy path → files with the verified user id, returns the issue identifier.
  const ok = await fetch(`${wired.base}/feedback`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: "user_feedback",
      error: "(user-submitted feedback, not an error)",
      timestamp: "2026-06-12T12:00:00.000Z",
      appVersion: "0.4.19",
      userMessage: "love it, but my deck never downloaded",
      logs: { backend: "", frontend: "" },
    }),
  });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ id: "BUG-7" });
  expect(sent).toHaveLength(1);
  const sent0 = sent[0];
  if (!sent0) throw new Error("expected sent[0] to exist");
  expect(sent0.userId).toBe("alice");
  expect(sent0.payload.userMessage).toBe(
    "love it, but my deck never downloaded",
  );

  await wired.close();
  await unwired.close();
});
