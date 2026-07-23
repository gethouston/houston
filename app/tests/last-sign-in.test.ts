import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  describeLastSignIn,
  type LastSignIn,
  readLastSignIn,
  writeLastSignIn,
} from "../src/lib/last-sign-in.ts";

const KEY = "houston.last-sign-in";

// A hermetic in-memory `localStorage`. last-sign-in reads `globalThis.localStorage`
// lazily at call time, so installing a fake before any call exercises the real
// load/save path. `throwOn` lets a test simulate a disabled / quota-full store.
class FakeLocalStorage {
  store = new Map<string, string>();
  throwOn: "get" | "set" | null = null;
  getItem(key: string): string | null {
    if (this.throwOn === "get") throw new Error("storage disabled");
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOn === "set") throw new Error("quota exceeded");
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

let fake: FakeLocalStorage;
beforeEach(() => {
  fake = new FakeLocalStorage();
  globalThis.localStorage = fake as unknown as Storage;
});
afterEach(() => {
  // @ts-expect-error — tear down the fake between tests.
  globalThis.localStorage = undefined;
});

test("write then read round-trips the hint", () => {
  const hint: LastSignIn = {
    provider: "google.com",
    email: "jane@gethouston.ai",
  };
  writeLastSignIn(hint);
  assert.deepEqual(readLastSignIn(), hint);
});

test("read returns null when nothing is stored", () => {
  assert.equal(readLastSignIn(), null);
});

test("stored blob is versioned", () => {
  writeLastSignIn({ provider: "apple.com", email: "" });
  const raw = fake.getItem(KEY);
  assert.ok(raw);
  assert.equal(JSON.parse(raw).v, 1);
});

test("corrupt JSON reads as no hint", () => {
  fake.store.set(KEY, "{not json");
  assert.equal(readLastSignIn(), null);
});

test("wrong version reads as no hint", () => {
  fake.store.set(
    KEY,
    JSON.stringify({ v: 99, provider: "google.com", email: "a@b.co" }),
  );
  assert.equal(readLastSignIn(), null);
});

test("unknown provider reads as no hint", () => {
  fake.store.set(
    KEY,
    JSON.stringify({ v: 1, provider: "twitter.com", email: "a@b.co" }),
  );
  assert.equal(readLastSignIn(), null);
});

test("missing email field reads as no hint", () => {
  fake.store.set(KEY, JSON.stringify({ v: 1, provider: "google.com" }));
  assert.equal(readLastSignIn(), null);
});

test("write swallows a full/disabled storage without throwing", () => {
  fake.throwOn = "set";
  assert.doesNotThrow(() =>
    writeLastSignIn({ provider: "google.com", email: "a@b.co" }),
  );
});

test("read swallows a disabled storage and returns null", () => {
  fake.throwOn = "get";
  assert.equal(readLastSignIn(), null);
});

test("describeLastSignIn maps each provider to its pill and brand name", () => {
  assert.deepEqual(
    describeLastSignIn({ provider: "google.com", email: "jane@x.co" }),
    { highlight: "google", providerName: "Google", email: "jane@x.co" },
  );
  assert.deepEqual(
    describeLastSignIn({ provider: "microsoft.com", email: "" }),
    { highlight: "azure", providerName: "Microsoft", email: "" },
  );
  assert.deepEqual(describeLastSignIn({ provider: "apple.com", email: "" }), {
    highlight: "apple",
    providerName: "Apple",
    email: "",
  });
});

test("describeLastSignIn shows the FULL address (never masked)", () => {
  assert.equal(
    describeLastSignIn({ provider: "google.com", email: "jane@gethouston.ai" })
      .email,
    "jane@gethouston.ai",
  );
});

test("describeLastSignIn hides a withheld or malformed address", () => {
  for (const bad of ["nobody", "@domain.com", "local@"]) {
    assert.equal(
      describeLastSignIn({ provider: "google.com", email: bad }).email,
      "",
    );
  }
});

test("describeLastSignIn routes email-based providers to the email form", () => {
  for (const provider of ["custom", "password"] as const) {
    const d = describeLastSignIn({ provider, email: "sam@x.co" });
    assert.equal(d.highlight, "email");
    assert.equal(d.providerName, null);
    assert.equal(d.email, "sam@x.co");
  }
});
