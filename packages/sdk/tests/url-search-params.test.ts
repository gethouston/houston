/**
 * Unit coverage for the `URLSearchParams` bundle shim (`src/bridge/
 * url-search-params.ts`), the fallback a bare JavaScriptCore lacks. Exercises
 * every construction form, the read/write surface, iteration order, and the
 * application/x-www-form-urlencoded serialization the runtime-client login path
 * depends on.
 */

import { describe, expect, it } from "vitest";
import { URLSearchParamsShim } from "../src/bridge/url-search-params";

describe("URLSearchParamsShim construction", () => {
  it("starts empty with no argument", () => {
    const p = new URLSearchParamsShim();
    expect(p.size).toBe(0);
    expect(p.toString()).toBe("");
  });

  it("parses a query string, tolerating a leading '?'", () => {
    const a = new URLSearchParamsShim("a=1&b=2");
    const b = new URLSearchParamsShim("?a=1&b=2");
    expect(a.get("a")).toBe("1");
    expect(a.get("b")).toBe("2");
    expect(b.toString()).toBe("a=1&b=2");
  });

  it("builds from a record", () => {
    const p = new URLSearchParamsShim({ deviceAuth: "false", n: 2 });
    expect(p.get("deviceAuth")).toBe("false");
    expect(p.get("n")).toBe("2");
  });

  it("builds from an iterable of pairs, keeping duplicates", () => {
    const p = new URLSearchParamsShim([
      ["a", "1"],
      ["a", "2"],
    ]);
    expect(p.getAll("a")).toEqual(["1", "2"]);
  });
});

describe("URLSearchParamsShim read/write surface", () => {
  it("get returns the first value, getAll returns all in order", () => {
    const p = new URLSearchParamsShim();
    p.append("a", "1");
    p.append("a", "2");
    expect(p.get("a")).toBe("1");
    expect(p.getAll("a")).toEqual(["1", "2"]);
    expect(p.get("missing")).toBeNull();
  });

  it("set replaces all existing entries for the name in place", () => {
    const p = new URLSearchParamsShim("a=1&b=2&a=3");
    p.set("a", "9");
    expect(p.getAll("a")).toEqual(["9"]);
    expect(p.toString()).toBe("a=9&b=2");
  });

  it("set appends when the name is absent", () => {
    const p = new URLSearchParamsShim("a=1");
    p.set("b", "2");
    expect(p.toString()).toBe("a=1&b=2");
  });

  it("has and delete cover every matching entry", () => {
    const p = new URLSearchParamsShim("a=1&a=2&b=3");
    expect(p.has("a")).toBe(true);
    p.delete("a");
    expect(p.has("a")).toBe(false);
    expect(p.size).toBe(1);
    expect(p.get("b")).toBe("3");
  });
});

describe("URLSearchParamsShim iteration", () => {
  it("preserves insertion order across entries/keys/values/forEach", () => {
    const p = new URLSearchParamsShim("z=1&a=2&z=3");
    expect([...p.entries()]).toEqual([
      ["z", "1"],
      ["a", "2"],
      ["z", "3"],
    ]);
    expect([...p.keys()]).toEqual(["z", "a", "z"]);
    expect([...p.values()]).toEqual(["1", "2", "3"]);
    const seen: string[] = [];
    p.forEach((v, k) => {
      seen.push(`${k}=${v}`);
    });
    expect(seen).toEqual(["z=1", "a=2", "z=3"]);
    expect([...p]).toEqual([...p.entries()]);
  });

  it("sort orders by name and keeps equal-key order stable", () => {
    const p = new URLSearchParamsShim("b=1&a=2&b=3&a=4");
    p.sort();
    expect(p.toString()).toBe("a=2&a=4&b=1&b=3");
  });
});

describe("URLSearchParamsShim serialization", () => {
  it("encodes spaces as '+' and percent-encodes reserved + unicode", () => {
    const p = new URLSearchParamsShim();
    p.set("q", "a b");
    p.set("path", "x/y&z");
    p.set("name", "café");
    expect(p.toString()).toBe("q=a+b&path=x%2Fy%26z&name=caf%C3%A9");
  });

  it("round-trips 'a=1&a=2&b=x+y' with '+' decoding to a space", () => {
    const p = new URLSearchParamsShim("a=1&a=2&b=x+y");
    expect(p.getAll("a")).toEqual(["1", "2"]);
    expect(p.get("b")).toBe("x y");
    expect(p.toString()).toBe("a=1&a=2&b=x+y");
  });

  it("mirrors the runtime-client startLogin query assembly", () => {
    const params = new URLSearchParamsShim();
    params.set("deviceAuth", "false");
    params.set("enterpriseDomain", "acme.ghe.com");
    expect(params.toString()).toBe(
      "deviceAuth=false&enterpriseDomain=acme.ghe.com",
    );
  });
});
