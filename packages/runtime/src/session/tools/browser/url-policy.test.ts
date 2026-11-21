import { afterEach, describe, expect, test, vi } from "vitest";
import { BrowserToolError } from "./errors";
import { fenceRefusal } from "./fence-refusals";
import type { PrivateNetworks } from "./ip-ranges";
import {
  BLOCKED_ON_PURPOSE,
  blockedHost,
  checkBrowserUrl,
  isBlockedHost,
  landedSafely,
} from "./url-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function code(raw: string, privateNetworks: PrivateNetworks = "blocked") {
  try {
    checkBrowserUrl(raw, privateNetworks);
  } catch (error) {
    expect(error).toBeInstanceOf(BrowserToolError);
    return (error as BrowserToolError).code;
  }
  return "allowed";
}

describe("checkBrowserUrl", () => {
  test("web pages pass, and a bare host gets https", () => {
    expect(checkBrowserUrl("https://example.com/a?b=1").href).toBe(
      "https://example.com/a?b=1",
    );
    expect(checkBrowserUrl("http://example.com").protocol).toBe("http:");
    expect(checkBrowserUrl("example.com/login").href).toBe(
      "https://example.com/login",
    );
  });

  test("anything but http and https is refused", () => {
    for (const raw of [
      "file:///etc/passwd",
      "chrome://settings",
      "javascript:alert(1)",
      "data:text/html,hi",
      "about:blank",
      "ftp://example.com",
    ])
      expect(code(raw)).toBe("url_refused");
  });

  test("this machine is refused on every port and spelling, managed or not", () => {
    for (const raw of [
      "http://127.0.0.1:4317/conversations",
      "http://127.0.0.1:4318/v1/agents",
      "http://127.0.0.1:3000",
      "http://127.8.9.10/",
      "http://localhost:11434/api/pull",
      "http://app.localhost/",
      "http://[::1]:4317/",
      "http://[::ffff:127.0.0.1]/",
      "http://2130706433/",
      "http://0.0.0.0:4318/",
      "http://[::]/",
    ]) {
      expect(code(raw), raw).toBe("url_refused");
      expect(code(raw, "allowed"), raw).toBe("url_refused");
    }
  });

  test("cloud metadata and cluster-internal names are refused, managed or not", () => {
    for (const raw of [
      "http://169.254.169.254/computeMetadata/v1/",
      "http://metadata.google.internal/",
      "http://metadata/",
      "http://metadata./",
      "http://metadata.google.internal./",
      "http://svc.cluster.internal./",
      "http://localhost./",
      "http://[fe80::1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[fec0::1]/",
    ]) {
      expect(code(raw), raw).toBe("url_refused");
      expect(code(raw, "allowed"), raw).toBe("url_refused");
    }
    expect(() => checkBrowserUrl("http://169.254.169.254/", "allowed")).toThrow(
      /not on the public web/,
    );
  });

  test("on the managed cloud private networks, carrier-grade NAT and IPv6 unique-local are refused", () => {
    for (const raw of [
      "http://10.0.0.1/",
      "http://10.255.255.255:8080/",
      "http://172.16.0.1/",
      "http://172.31.255.254/",
      "http://192.168.1.1/admin",
      "http://100.64.0.1/",
      "http://100.127.255.255/",
      "http://3232235777/",
      "http://0xa000001/",
      "http://192.168.1.1./",
      "http://[::ffff:10.0.0.1]/",
      "http://[::ffff:c0a8:101]/",
      "http://[fd00::1]/",
      "http://[fc12:3456::1]/",
    ])
      expect(code(raw), raw).toBe("url_refused");
    expect(blockedHost("10.1.2.3", "blocked")).toBe("private_network");
    expect(blockedHost("[fd00::1]", "blocked")).toBe("private_network");
    expect(blockedHost("127.0.0.1", "blocked")).toBe("this_machine");
    expect(blockedHost("[::ffff:7f00:1]", "blocked")).toBe("this_machine");
  });

  test("off the managed cloud a team's intranet addresses open", () => {
    for (const raw of [
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/admin",
      "http://100.64.0.1/",
      "http://3232235777/",
      "http://[::ffff:10.0.0.1]/",
      "http://[fd00::1]/",
    ])
      expect(code(raw, "allowed"), raw).toBe("allowed");
  });

  test("without an explicit choice the check follows this process's deployment", () => {
    vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
    expect(code("http://10.0.0.1/", undefined)).toBe("url_refused");
    expect(landedSafely("http://10.0.0.1/")).toBe(false);
    vi.stubEnv("HOUSTON_MANAGED_CLOUD", "");
    expect(checkBrowserUrl("http://10.0.0.1/").hostname).toBe("10.0.0.1");
    expect(landedSafely("http://10.0.0.1/")).toBe(true);
  });

  test("the refusal says which kind of address it was", () => {
    expect(() => checkBrowserUrl("http://10.0.0.1/", "blocked")).toThrow(
      /private network/,
    );
    expect(() => checkBrowserUrl("http://127.0.0.1/", "allowed")).toThrow(
      /this computer/,
    );
    expect(() => checkBrowserUrl("http://metadata/", "blocked")).toThrow(
      /not on the public web/,
    );
  });

  test("ordinary hosts that merely look local pass, and so does the edge of each range", () => {
    for (const host of [
      "localhost.example.com",
      "127.example.com",
      "10.example.com",
      "8.8.8.8",
      "11.0.0.1",
      "172.15.255.255",
      "172.32.0.0",
      "192.167.255.255",
      "192.169.0.0",
      "100.63.255.255",
      "100.128.0.0",
      "[2001:4860:4860::8888]",
      "[fbff::1]",
      "[::ffff:8.8.8.8]",
    ])
      expect(isBlockedHost(host, "blocked"), host).toBe(false);
  });

  test("an empty or unparseable address is an invalid action", () => {
    expect(code("")).toBe("invalid_action");
    expect(code("https://exa mple.com")).toBe("invalid_action");
  });
});

describe("a refusal", () => {
  function refusal(raw: string): string {
    try {
      checkBrowserUrl(raw, "blocked");
    } catch (error) {
      return (error as BrowserToolError).message;
    }
    return "allowed";
  }

  test("says a non-public address is blocked on purpose, not to be fetched another way", () => {
    expect(BLOCKED_ON_PURPOSE).toMatch(/blocked on purpose/);
    expect(BLOCKED_ON_PURPOSE).toMatch(/shell, curl or code/);
    for (const message of [
      refusal("http://169.254.169.254/"),
      refusal("http://metadata.google.internal/"),
      refusal("http://10.1.2.3/"),
      fenceRefusal("rebind.example.com").message,
      fenceRefusal("10.0.0.5").message,
    ]) {
      expect(message).toContain(BLOCKED_ON_PURPOSE);
      expect(message).not.toMatch(/\u2014/);
    }
  });

  test("leaves this machine's own addresses to the shell", () => {
    for (const message of [
      refusal("http://127.0.0.1:3000/"),
      refusal("http://localhost:5173/"),
      fenceRefusal("127.0.0.1").message,
      fenceRefusal("localhost").message,
    ]) {
      expect(message).toMatch(/this computer|not on the public web/);
      expect(message).not.toContain(BLOCKED_ON_PURPOSE);
    }
  });
});

describe("landedSafely", () => {
  test("a redirect onto a refused page is caught", () => {
    expect(landedSafely("https://example.com/home")).toBe(true);
    expect(landedSafely("about:blank")).toBe(true);
    expect(landedSafely("http://localhost:4317/v1")).toBe(false);
    expect(landedSafely("http://169.254.169.254/")).toBe(false);
    expect(landedSafely("http://192.168.0.1/", "blocked")).toBe(false);
    expect(landedSafely("http://[fd00::1]/", "blocked")).toBe(false);
    expect(landedSafely("http://192.168.0.1/", "allowed")).toBe(true);
    expect(landedSafely("http://169.254.169.254/", "allowed")).toBe(false);
    expect(landedSafely("file:///etc/hosts")).toBe(false);
    expect(landedSafely("chrome-error://chromewebdata/")).toBe(false);
  });
});
