import { afterEach, describe, expect, test, vi } from "vitest";
import { setAdapterErrorSink } from "../error-sink";
import type { HoustonClientBase } from "./base";

vi.mock("../agent-files", () => ({
  readAgentFile: vi.fn(),
  writeAgentFile: vi.fn(),
}));
vi.mock("../bus", () => ({ emitLocalEcho: vi.fn() }));

const { AgentFilesMixin } = await import("./agent-files-mixin");

const CONFIG = ".houston/config/config.json";

function client(setSettings: (input: unknown) => Promise<unknown>) {
  class Base {
    ctx = { cp: null, engine: { setSettings } };
  }
  return new (AgentFilesMixin(
    Base as unknown as new () => HoustonClientBase,
  ))();
}

afterEach(() => {
  setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));
});

describe("writeAgentFile settings mirror", () => {
  test("an effort-only config doc sets the runtime's effort", async () => {
    const setSettings = vi.fn(async () => ({}));

    await client(setSettings).writeAgentFile(
      ".assistant",
      CONFIG,
      JSON.stringify({ effort: "high" }),
    );

    expect(setSettings).toHaveBeenCalledWith({ effort: "high" });
  });

  test("a failed mirror is reported, and the write still succeeds", async () => {
    const sink = vi.fn();
    setAdapterErrorSink(sink);
    const refused = new Error("runtime unreachable");

    await expect(
      client(async () => {
        throw refused;
      }).writeAgentFile(
        ".assistant",
        CONFIG,
        JSON.stringify({ effort: "low" }),
      ),
    ).resolves.toBeUndefined();

    expect(sink).toHaveBeenCalledWith(
      "engine-adapter.config-settings-sync",
      refused,
    );
  });

  test("a file that is not the config doc never touches settings", async () => {
    const setSettings = vi.fn(async () => ({}));

    await client(setSettings).writeAgentFile(
      ".assistant",
      ".houston/learnings/learnings.json",
      "[]",
    );

    expect(setSettings).not.toHaveBeenCalled();
  });
});
