import { strictEqual } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  claimLaunchCheck,
  resetLaunchCheckClaimForTests,
} from "../src/lib/update-launch-claim.ts";

/** A `sessionStorage` stand-in: the node runner has none, and the claim must
 *  behave the same with and without one. */
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

// The launch check is the first check of the PROCESS. The hook that runs it
// is remounted with <App/> on every identity change, so "first check since
// mount" would turn a mid-session find into a launch-time install.
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
    // The hook's own state is gone after a remount; the claim is not.
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
    // A reload drops module state but keeps the session; the claim must hold.
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
