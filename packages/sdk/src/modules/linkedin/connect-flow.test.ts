import { describe, expect, it } from "vitest";
import {
  type LinkedInConnectPorts,
  LinkedInLoopbackRefusedError,
  startLinkedInConnect,
} from "./connect-flow";
import type { LinkedInConnectReturn } from "./types";

const URL_ = "https://www.linkedin.com/oauth/v2/authorization?state=s";
const STATE = "q9X-_3abcDEF4567";

/** Ports that record every effect; web-shaped (no listener, no tab). */
function harness(overrides: Partial<LinkedInConnectPorts> = {}) {
  const log: string[] = [];
  const asked: (LinkedInConnectReturn | undefined)[] = [];
  const ports: LinkedInConnectPorts = {
    connect: async (returnTo) => {
      asked.push(returnTo);
      return { url: URL_, accepted: returnTo?.kind ?? null };
    },
    listener: null,
    newState: () => STATE,
    tab: null,
    open: async (url) => {
      log.push(`open ${url}`);
      return true;
    },
    report: (command) => log.push(`report ${command}`),
    ...overrides,
  };
  return { ports, log, asked };
}

const listener = (log: string[], fails = false) => ({
  start: async (state: string) => {
    log.push(`start ${state}`);
    if (fails) throw new Error("bind");
    return { port: 50123, attemptId: 7 };
  },
  cancel: async (id: number) => {
    log.push(`cancel ${id}`);
  },
});

const tab = (log: string[], navigates: boolean) => ({
  navigate: (url: string) => {
    log.push(`navigate ${url}`);
    return navigates;
  },
  discard: () => log.push("discard"),
});

describe("startLinkedInConnect on the web", () => {
  it("names no return and points the tab the click claimed at LinkedIn", async () => {
    const h = harness();
    h.ports.tab = tab(h.log, true);
    await expect(startLinkedInConnect(h.ports)).resolves.toEqual({
      kind: "opened",
    });
    expect(h.asked).toEqual([undefined]);
    expect(h.log).toEqual([`navigate ${URL_}`]);
  });

  it("opens nothing else when the person closed the claimed tab", async () => {
    const h = harness();
    h.ports.tab = tab(h.log, false);
    await expect(startLinkedInConnect(h.ports)).resolves.toEqual({
      kind: "abandoned",
    });
  });

  it("offers the page behind a click when the plain open was refused", async () => {
    const h = harness({ open: async () => false });
    await expect(startLinkedInConnect(h.ports)).resolves.toEqual({
      kind: "blocked",
      url: URL_,
    });
  });

  it("discards the claimed tab when the mint fails, and rethrows", async () => {
    const failure = new Error("503");
    const h = harness({ connect: () => Promise.reject(failure) });
    h.ports.tab = tab(h.log, true);
    await expect(startLinkedInConnect(h.ports)).rejects.toBe(failure);
    expect(h.log).toEqual(["discard"]);
  });
});

describe("startLinkedInConnect on the desktop", () => {
  it("binds the listener first and names its port and state", async () => {
    const h = harness();
    h.ports.listener = listener(h.log);
    await expect(startLinkedInConnect(h.ports)).resolves.toEqual({
      kind: "opened",
    });
    expect(h.asked).toEqual([{ kind: "loopback", port: 50123, state: STATE }]);
    expect(h.log).toEqual([`start ${STATE}`, `open ${URL_}`]);
  });

  it("falls back to the app deep link when the listener cannot start", async () => {
    const h = harness();
    h.ports.listener = listener(h.log, true);
    await startLinkedInConnect(h.ports);
    expect(h.asked).toEqual([{ kind: "app" }]);
    expect(h.log).toContain("report start_channels_loopback");
  });

  it("frees the listener and reports when the gateway took another return", async () => {
    const reported: unknown[] = [];
    const h = harness({
      connect: async () => ({ url: URL_, accepted: "app" }),
    });
    h.ports.listener = listener(h.log);
    h.ports.report = (command, error) => {
      h.log.push(`report ${command}`);
      reported.push(error);
    };
    await startLinkedInConnect(h.ports);
    expect(h.log).toEqual([
      `start ${STATE}`,
      "report connect_linkedin_loopback",
      "cancel 7",
      `open ${URL_}`,
    ]);
    expect(reported[0]).toBeInstanceOf(LinkedInLoopbackRefusedError);
  });

  it("frees the listener when the mint fails", async () => {
    const h = harness({ connect: () => Promise.reject(new Error("x")) });
    h.ports.listener = listener(h.log);
    await expect(startLinkedInConnect(h.ports)).rejects.toThrow("x");
    expect(h.log).toEqual([`start ${STATE}`, "cancel 7"]);
  });

  it("keeps the listener up when the browser merely refused to open", async () => {
    const h = harness({ open: async () => false });
    h.ports.listener = listener(h.log);
    expect((await startLinkedInConnect(h.ports)).kind).toBe("blocked");
    expect(h.log).toEqual([`start ${STATE}`]);
  });
});
