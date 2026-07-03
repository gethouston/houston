import { describe, expect, it, vi } from "vitest";
import {
  type CommandEnvelope,
  CommandRegistry,
  isCommandEnvelope,
} from "./commands";

describe("isCommandEnvelope", () => {
  it("accepts a minimal valid envelope", () => {
    expect(isCommandEnvelope({ id: "1", type: "agents/refresh" })).toBe(true);
    expect(
      isCommandEnvelope({ id: "1", type: "t", payload: { any: "json" } }),
    ).toBe(true);
  });

  it("rejects non-objects and missing/wrong-typed fields", () => {
    expect(isCommandEnvelope(null)).toBe(false);
    expect(isCommandEnvelope(undefined)).toBe(false);
    expect(isCommandEnvelope("x")).toBe(false);
    expect(isCommandEnvelope(42)).toBe(false);
    expect(isCommandEnvelope({ type: "t" })).toBe(false);
    expect(isCommandEnvelope({ id: "1" })).toBe(false);
    expect(isCommandEnvelope({ id: 1, type: "t" })).toBe(false);
    expect(isCommandEnvelope({ id: "1", type: 2 })).toBe(false);
  });
});

describe("CommandRegistry.register", () => {
  it("throws on duplicate type registration", () => {
    const registry = new CommandRegistry();
    registry.register("agents/refresh", () => undefined);
    expect(() => registry.register("agents/refresh", () => 1)).toThrowError(
      /already registered: agents\/refresh/,
    );
  });

  it("tracks registration with has()", () => {
    const registry = new CommandRegistry();
    expect(registry.has("t")).toBe(false);
    registry.register("t", () => undefined);
    expect(registry.has("t")).toBe(true);
  });
});

describe("CommandRegistry.dispatch", () => {
  it("returns ok:false for an unknown type (never throws)", async () => {
    const registry = new CommandRegistry();
    const result = await registry.dispatch({ id: "7", type: "nope" });
    expect(result).toEqual({
      id: "7",
      ok: false,
      error: { message: "unknown command type: nope" },
    });
  });

  it("returns ok:true with the handler's value, passing the payload", async () => {
    const registry = new CommandRegistry();
    const handler = vi.fn((payload: unknown) => ({ echoed: payload }));
    registry.register("echo", handler);
    const envelope: CommandEnvelope = {
      id: "9",
      type: "echo",
      payload: { a: 1 },
    };
    const result = await registry.dispatch(envelope);
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(result).toEqual({ id: "9", ok: true, value: { echoed: { a: 1 } } });
  });

  it("awaits async handlers", async () => {
    const registry = new CommandRegistry();
    registry.register("slow", async () => "done");
    const result = await registry.dispatch({ id: "1", type: "slow" });
    expect(result).toEqual({ id: "1", ok: true, value: "done" });
  });

  it("converts a thrown Error into ok:false with its message", async () => {
    const registry = new CommandRegistry();
    registry.register("boom", () => {
      throw new Error("kaboom");
    });
    const result = await registry.dispatch({ id: "2", type: "boom" });
    expect(result).toEqual({
      id: "2",
      ok: false,
      error: { message: "kaboom" },
    });
  });

  it("preserves a numeric status from an EngineError-like throw", async () => {
    const registry = new CommandRegistry();
    class EngineErrorLike extends Error {
      constructor(public status: number) {
        super("engine failed");
      }
    }
    registry.register("fail", () => {
      throw new EngineErrorLike(503);
    });
    const result = await registry.dispatch({ id: "3", type: "fail" });
    expect(result).toEqual({
      id: "3",
      ok: false,
      error: { message: "engine failed", status: 503 },
    });
  });

  it("stringifies a non-Error throw", async () => {
    const registry = new CommandRegistry();
    registry.register("weird", () => {
      throw "just a string";
    });
    const result = await registry.dispatch({ id: "4", type: "weird" });
    expect(result).toEqual({
      id: "4",
      ok: false,
      error: { message: "just a string" },
    });
  });
});
