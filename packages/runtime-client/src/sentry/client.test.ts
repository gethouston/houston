import type { Event } from "@sentry/core";
import { createTransport } from "@sentry/core";
import { describe, expect, it } from "vitest";
import type { EngineSentryConfig } from "./activation";
import { createEngineSentry, type EngineSentry } from "./client";
import { installConsoleCapture } from "./console-capture";

const CONFIG: EngineSentryConfig = {
  dsn: "https://key@o1.ingest.sentry.io/1",
  environment: "production",
  release: "houston-app@0.5.9",
  deployment: "managed-cloud",
  tags: { org_slug: "acme", agent_slug: "Workspace%2FMax" },
};

/** A sentry client whose envelopes land in `events` instead of the network. */
function testSentry(config: EngineSentryConfig = CONFIG): {
  sentry: EngineSentry;
  events: Event[];
} {
  const events: Event[] = [];
  const sentry = createEngineSentry("host", config, (options) =>
    createTransport(options, async (request) => {
      // Envelope = newline-separated JSON: header, then (item header, item)*.
      const lines = (request.body as string).split("\n");
      for (let i = 1; i < lines.length; i += 2) {
        const header = JSON.parse(lines[i] ?? "{}");
        if (header.type === "event") {
          events.push(JSON.parse(lines[i + 1] ?? "{}"));
        }
      }
      return { statusCode: 200 };
    }),
  );
  return { sentry, events };
}

describe("createEngineSentry", () => {
  it("captures an exception with stack, tags, and identity", async () => {
    const { sentry, events } = testSentry();
    const id = sentry.captureException(new Error("pod boom"), {
      source: "test",
    });
    await sentry.flush();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(events).toHaveLength(1);
    const event = events[0] as Event;
    expect(event.exception?.values?.[0]).toMatchObject({
      type: "Error",
      value: "pod boom",
    });
    expect(
      event.exception?.values?.[0]?.stacktrace?.frames?.length,
    ).toBeGreaterThan(0);
    expect(event.tags).toMatchObject({
      runtime: "engine",
      engine_process: "host",
      deployment: "managed-cloud",
      org_slug: "acme",
      agent_slug: "Workspace%2FMax",
    });
    expect(event.release).toBe("houston-app@0.5.9");
    expect(event.environment).toBe("production");
    expect(event.extra).toMatchObject({ source: "test" });
  });

  it("captureLog: ERROR with an Error value becomes an exception event", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("ERROR", [
      "[local-host] uncaughtException:",
      new Error("kaput"),
    ]);
    await sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.value).toBe("kaput");
    expect(events[0]?.extra?.log_message).toContain("uncaughtException");
  });

  it("captureLog: bare-string ERROR becomes a message event", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("ERROR", ["settle write failed after %d tries", 3]);
    await sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe("settle write failed after 3 tries");
    expect(events[0]?.level).toBe("error");
  });

  it("captureLog: bare-string ERROR carries a synthetic thread stack at the log site", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("ERROR", ["stackless failure"]);
    await sentry.flush();

    // The stack rides as a thread — NOT an exception — so the issue title
    // stays the message instead of the top frame's function name.
    expect(events[0]?.exception).toBeUndefined();
    expect(events[0]?.message).toBe("stackless failure");
    const frames = events[0]?.threads?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frames.length).toBeGreaterThan(0);
    // The reporter's own frames (captureLog/guarded in client.ts) are trimmed
    // so the innermost frame is the code that logged, not the crash reporter.
    expect(frames[frames.length - 1]?.filename).toMatch(/client\.test\.ts$/);
  });

  it("captureLog: Node process warnings via console.error stay breadcrumbs", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("ERROR", [
      "(node:19) [CLAUDE_SDK_CAN_USE_TOOL_SHADOWED] Warning: canUseTool will not be invoked",
    ]);
    await sentry.flush();
    expect(events).toHaveLength(0);

    sentry.captureLog("ERROR", ["a real failure"]);
    await sentry.flush();
    const crumbs = events[0]?.breadcrumbs ?? [];
    expect(crumbs[0]?.message).toContain("CLAUDE_SDK_CAN_USE_TOOL_SHADOWED");
    expect(crumbs[0]?.level).toBe("warning");
  });

  it("stamps the org as the Sentry user on managed pods (users-affected count)", async () => {
    const { sentry, events } = testSentry();
    sentry.captureException(new Error("who was hit?"));
    await sentry.flush();
    expect(events[0]?.user).toEqual({ id: "acme" });
  });

  it("parent-injected identity wins over the org fallback", async () => {
    const { sentry, events } = testSentry({
      ...CONFIG,
      user: { email: "felipe@example.com", username: "Felipe" },
    });
    sentry.captureException(new Error("who exactly?"));
    await sentry.flush();
    // No explicit id → the org slug still fills it in; email/name ride along.
    expect(events[0]?.user).toEqual({
      id: "acme",
      email: "felipe@example.com",
      username: "Felipe",
    });
  });

  it("inlines the source lines around each stack frame", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("ERROR", ["where is my snippet"]);
    await sentry.flush();

    const frames = events[0]?.threads?.values?.[0]?.stacktrace?.frames ?? [];
    const site = frames[frames.length - 1];
    // The innermost frame is this test file — its context_line must be the
    // actual captureLog call above, with surrounding lines on both sides.
    expect(site?.context_line).toContain("where is my snippet");
    expect(site?.pre_context?.length).toBeGreaterThan(0);
    expect(site?.post_context?.length).toBeGreaterThan(0);
  });

  it("leaves events user-less without an org slug (desktop/self-host)", async () => {
    const { sentry, events } = testSentry({ ...CONFIG, tags: {} });
    sentry.captureException(new Error("anonymous deployment"));
    await sentry.flush();
    expect(events[0]?.user).toBeUndefined();
  });

  it("stamps os and app-start contexts on every event", async () => {
    const { sentry, events } = testSentry();
    sentry.captureException(new Error("ctx check"));
    await sentry.flush();

    expect(events[0]?.contexts?.os?.name).toBe(process.platform);
    expect(events[0]?.contexts?.app?.app_start_time).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("captureLog: INFO/WARN are breadcrumbs riding the next event, not events", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("INFO", ["booting agent runtime"]);
    sentry.captureLog("WARN", ["provider slow"]);
    await sentry.flush();
    expect(events).toHaveLength(0);

    sentry.captureLog("ERROR", ["it broke"]);
    await sentry.flush();
    const crumbs = events[0]?.breadcrumbs ?? [];
    expect(crumbs.map((b) => b.message)).toEqual([
      "booting agent runtime",
      "provider slow",
    ]);
    expect(crumbs[1]?.level).toBe("warning");
  });

  it("redacts token=… credentials from captured lines (the host banner)", async () => {
    const { sentry, events } = testSentry();
    sentry.captureLog("INFO", [
      "HOUSTON_HOST_LISTENING port=4318 token=deadbeefcafe",
    ]);
    sentry.captureLog("ERROR", ["request failed with api_key=sk-secret-123"]);
    await sentry.flush();

    expect(events[0]?.message).toBe("request failed with api_key=[redacted]");
    expect(events[0]?.breadcrumbs?.[0]?.message).toBe(
      "HOUSTON_HOST_LISTENING port=4318 token=[redacted]",
    );
  });

  it("installConsoleCapture keeps printing and reports errors once", async () => {
    const { sentry, events } = testSentry();
    const printed: unknown[][] = [];
    const fakeConsole = {
      debug: (...v: unknown[]) => printed.push(v),
      error: (...v: unknown[]) => printed.push(v),
      info: (...v: unknown[]) => printed.push(v),
      log: (...v: unknown[]) => printed.push(v),
      warn: (...v: unknown[]) => printed.push(v),
    } as unknown as Console;

    const restore = installConsoleCapture(sentry, fakeConsole);
    fakeConsole.info("hello");
    fakeConsole.error("boom", new Error("from console"));
    await sentry.flush();

    expect(printed).toEqual([["hello"], ["boom", new Error("from console")]]);
    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.value).toBe("from console");

    restore();
    fakeConsole.error("after restore");
    await sentry.flush();
    expect(events).toHaveLength(1);
  });
});
