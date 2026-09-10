import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import type { Event } from "@sentry/core";
import { createTransport } from "@sentry/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EngineSentryConfig } from "./activation";
import { createEngineSentry, type EngineSentry } from "./client";
import { defaultBundlePath } from "./map-frames";
import {
  buildFixtureBundle,
  type FixtureBundle,
  LOG_LINE,
  THROW_LINE,
} from "./source-map.fixture";

interface Fixture {
  throwFromFixture(): never;
  logFromFixture(sentry: EngineSentry): void;
}

const CONFIG: EngineSentryConfig = {
  dsn: "https://key@o1.ingest.sentry.io/1",
  environment: "production",
  release: "engine-pod@abc",
  deployment: "managed-cloud",
  tags: {},
};

function testSentry(bundlePath: string): {
  sentry: EngineSentry;
  events: Event[];
} {
  const events: Event[] = [];
  const sentry = createEngineSentry(
    "host",
    CONFIG,
    (options) =>
      createTransport(options, async (request) => {
        const lines = (request.body as string).split("\n");
        for (let i = 1; i < lines.length; i += 2) {
          if (JSON.parse(lines[i] ?? "{}").type === "event") {
            events.push(JSON.parse(lines[i + 1] ?? "{}"));
          }
        }
        return { statusCode: 200 };
      }),
    { bundlePath },
  );
  return { sentry, events };
}

let fixture: FixtureBundle;
let mod: Fixture;

beforeAll(async () => {
  fixture = await buildFixtureBundle();
  mod = createRequire(import.meta.url)(fixture.bundlePath) as Fixture;
});

afterAll(() => {
  rmSync(fixture.dir, { recursive: true, force: true });
});

function thrown(): Error {
  try {
    mod.throwFromFixture();
  } catch (err) {
    return err as Error;
  }
  throw new Error("fixture did not throw");
}

describe("bundle frame mapping", () => {
  it("the fixture's raw stack points at the bundle (the harness does not map it)", () => {
    expect(thrown().stack).toContain(`${fixture.bundlePath}:`);
    expect(thrown().stack).not.toContain("site.ts");
  });

  it("exception frames map to the original .ts file, line and column, with context", async () => {
    const { sentry, events } = testSentry(fixture.bundlePath);
    sentry.captureException(thrown());
    await sentry.flush();

    const frames = events[0]?.exception?.values?.[0]?.stacktrace?.frames ?? [];
    const top = frames[frames.length - 1];
    expect(top?.filename).toBe(fixture.sitePath);
    expect(top?.lineno).toBe(THROW_LINE);
    // V8 reports the `new`: 1-based column 9 in the generated
    // `  throw new Error(`, 13 in the over-indented original. Anything else
    // is a 0/1-based slip or a lost segment offset.
    expect(top?.colno).toBe(13);
    expect(top?.in_app).toBe(true);
    expect(top?.context_line).toContain('throw new Error("fixture boom")');
    expect(top?.pre_context?.length).toBeGreaterThan(0);
    // No frame is left at the bundle path; the test's own frame is untouched.
    expect(frames.every((f) => f.filename !== fixture.bundlePath)).toBe(true);
    expect(
      frames.some((f) => /map-frames\.test\.ts$/.test(f.filename ?? "")),
    ).toBe(true);
  });

  it("a bare-string ERROR logged from the bundle trims the mapped reporter frame", async () => {
    // Stack: client.ts (captureLog) ← logging.ts (bundle) ← site.ts (bundle).
    // logging.ts only reads as a reporter frame AFTER mapping; without it the
    // event's top frame would be the log helper instead of the log site.
    const { sentry, events } = testSentry(fixture.bundlePath);
    mod.logFromFixture(sentry);
    await sentry.flush();

    expect(events[0]?.message).toBe("fixture log site");
    const frames = events[0]?.threads?.values?.[0]?.stacktrace?.frames ?? [];
    const site = frames[frames.length - 1];
    expect(site?.filename).toBe(fixture.sitePath);
    expect(site?.lineno).toBe(LOG_LINE);
    expect(site?.context_line).toContain('emit(sentry, "fixture log site")');
    expect(frames.some((f) => f.filename === fixture.loggingPath)).toBe(false);
  });

  it("repeated sites hit the position cache (one event, one scan, same answer)", async () => {
    const { sentry, events } = testSentry(fixture.bundlePath);
    sentry.captureException(thrown());
    sentry.captureException(thrown());
    await sentry.flush();
    const tops = events.map((e) => {
      const frames = e.exception?.values?.[0]?.stacktrace?.frames ?? [];
      return frames[frames.length - 1];
    });
    expect(tops[1]).toMatchObject({
      filename: fixture.sitePath,
      lineno: THROW_LINE,
      colno: 13,
    });
  });

  it("no map beside the bundle → frames stay at bundle offsets, nothing throws", async () => {
    const { sentry, events } = testSentry(`${fixture.dir}/nowhere/main.mjs`);
    sentry.captureException(thrown());
    await sentry.flush();
    const frames = events[0]?.exception?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frames[frames.length - 1]?.filename).toBe(fixture.bundlePath);
  });

  it("defaultBundlePath: the resolved argv[1] on Node, nothing under Bun", () => {
    expect(defaultBundlePath(["node", "dist/host/main.mjs"], {} as never)).toBe(
      `${process.cwd()}/dist/host/main.mjs`,
    );
    expect(
      defaultBundlePath(["bun", "/$bunfs/root/main"], { bun: "1.2" } as never),
    ).toBeUndefined();
    expect(defaultBundlePath(["node"], {} as never)).toBeUndefined();
  });
});
