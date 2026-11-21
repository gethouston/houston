import { strictEqual } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  claimLaunchCheck,
  resetLaunchCheckClaimForTests,
} from "../src/lib/update-launch-claim.ts";

function installSessionStorage(): Map<string, string> {
  const backing = new Map<string, string>();
  const fake = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: fake,
    configurable: true,
    writable: true,
  });
  return backing;
}

function uninstallSessionStorage(): void {
  Reflect.deleteProperty(globalThis, "sessionStorage");
}

describe("claimLaunchCheck", () => {
  beforeEach(() => {
    uninstallSessionStorage();
    resetLaunchCheckClaimForTests();
  });
  afterEach(() => {
    resetLaunchCheckClaimForTests();
    uninstallSessionStorage();
  });

  it("hands the first check of a process the launch origin", () => {
    strictEqual(claimLaunchCheck(), "launch");
  });

  it("calls every later check mid-session, a remount of the hook included", () => {
    strictEqual(claimLaunchCheck(), "launch");
    strictEqual(claimLaunchCheck(), "poll");
    strictEqual(claimLaunchCheck(), "poll");
  });

  it("records the claim in sessionStorage so a webview reload stays mid-session", () => {
    const backing = installSessionStorage();
    strictEqual(claimLaunchCheck(), "launch");
    strictEqual(backing.get("houston.updater.launch-check-claimed"), "1");
  });

  it("honours a claim left by the previous page of the same session", () => {
    const backing = installSessionStorage();
    backing.set("houston.updater.launch-check-claimed", "1");
    strictEqual(claimLaunchCheck(), "poll");
  });

  it("starts over for a fresh process", () => {
    installSessionStorage();
    strictEqual(claimLaunchCheck(), "launch");
    resetLaunchCheckClaimForTests();
    strictEqual(claimLaunchCheck(), "launch");
  });
});
