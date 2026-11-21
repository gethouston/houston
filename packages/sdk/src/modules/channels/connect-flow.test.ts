import type { SlackConnectReturn } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  type SlackConnectPorts,
  SlackLoopbackRefusedError,
  startSlackConnect,
} from "./connect-flow";
import type { SlackConnectAnswer } from "./types";

const URL = "https://slack.com/oauth/v2/authorize?state=opaque";
const STATE = "q9X-_3abcDEF4567";
const LOOPBACK = `{"kind":"loopback","port":53124,"state":"${STATE}"}`;

interface Options {
  desktop?: boolean;
  startFails?: boolean;
  cancelFails?: boolean;
  accepted?: SlackConnectAnswer["accepted"];
  connectFails?: boolean;
  open?: "opened" | "refused" | "throws";
  movesDuringCancel?: boolean;
}

function harness(opts: Options = {}) {
  const steps: string[] = [];
  const reported: string[] = [];
  let moved = false;
  const ports: SlackConnectPorts = {
    connect: async (returnTo: SlackConnectReturn | undefined) => {
      steps.push(`connect ${JSON.stringify(returnTo ?? null)}`);
      if (opts.connectFails) throw new Error("gateway said 503");
      const accepted =
        "accepted" in opts ? (opts.accepted ?? null) : (returnTo?.kind ?? null);
      return { url: URL, accepted };
    },
    listener:
      opts.desktop === false
        ? null
        : {
            start: async (state) => {
              steps.push(`start ${state}`);
              if (opts.startFails) throw new Error("bind refused");
              return { port: 53124, attemptId: 7 };
            },
            cancel: async (attemptId) => {
              steps.push(`cancel ${attemptId}`);
              if (opts.movesDuringCancel) moved = true;
              if (opts.cancelFails) throw new Error("lock poisoned");
            },
          },
    newState: () => STATE,
    assertCurrent: () => {
      if (moved) throw new DOMException("Channel scope changed", "AbortError");
    },
    open: async (url) => {
      steps.push(`open ${url}`);
      if (opts.open === "throws") throw new Error("no browser");
      return opts.open !== "refused";
    },
    report: (command, error) =>
      reported.push(`${command}: ${(error as Error).message}`),
  };
  return { steps, reported, ports };
}

describe("a desktop Slack connect", () => {
  it("binds the listener first, names its port and state, and keeps it", async () => {
    const { steps, reported, ports } = harness();
    expect(await startSlackConnect(ports)).toEqual({ url: URL, opened: true });
    expect(steps).toEqual([
      `start ${STATE}`,
      `connect ${LOOPBACK}`,
      `open ${URL}`,
    ]);
    expect(reported).toEqual([]);
  });

  it("returns over the app link when the listener cannot start", async () => {
    const { steps, reported, ports } = harness({ startFails: true });
    expect(await startSlackConnect(ports)).toEqual({ url: URL, opened: true });
    expect(steps).toEqual([
      `start ${STATE}`,
      'connect {"kind":"app"}',
      `open ${URL}`,
    ]);
    expect(reported).toEqual(["start_channels_loopback: bind refused"]);
  });

  it("frees the listener and reports the skew when the gateway took app", async () => {
    const { steps, reported, ports } = harness({ accepted: "app" });
    expect(await startSlackConnect(ports)).toEqual({ url: URL, opened: true });
    expect(steps).toEqual([
      `start ${STATE}`,
      `connect ${LOOPBACK}`,
      "cancel 7",
      `open ${URL}`,
    ]);
    expect(reported).toEqual([
      `connect_slack_loopback: ${new SlackLoopbackRefusedError().message}`,
    ]);
  });

  it("frees the listener when the connect fails, and still fails", async () => {
    const { steps, ports } = harness({ connectFails: true });
    await expect(startSlackConnect(ports)).rejects.toThrow("gateway said 503");
    expect(steps).toEqual([
      `start ${STATE}`,
      `connect ${LOOPBACK}`,
      "cancel 7",
    ]);
  });

  it("frees the listener when the page cannot be opened", async () => {
    const { steps, ports } = harness({ open: "throws" });
    await expect(startSlackConnect(ports)).rejects.toThrow("no browser");
    expect(steps).toEqual([
      `start ${STATE}`,
      `connect ${LOOPBACK}`,
      `open ${URL}`,
      "cancel 7",
    ]);
  });

  it("keeps the listener when the browser refused, for the reopen click", async () => {
    const { steps, ports } = harness({ open: "refused" });
    expect(await startSlackConnect(ports)).toEqual({ url: URL, opened: false });
    expect(steps).not.toContain("cancel 7");
  });

  it("reports a cancel that fails and keeps the original error", async () => {
    const { reported, ports } = harness({
      open: "throws",
      cancelFails: true,
    });
    await expect(startSlackConnect(ports)).rejects.toThrow("no browser");
    expect(reported).toEqual(["cancel_channels_loopback: lock poisoned"]);
  });

  it("opens nothing for a space left while the skewed listener was freed", async () => {
    const { steps, ports } = harness({
      accepted: "app",
      movesDuringCancel: true,
    });
    await expect(startSlackConnect(ports)).rejects.toThrow(
      "Channel scope changed",
    );
    expect(steps).toEqual([
      `start ${STATE}`,
      `connect ${LOOPBACK}`,
      "cancel 7",
    ]);
  });

  it("cancels a skewed listener once, even when the open then fails", async () => {
    const { steps, ports } = harness({ accepted: "app", open: "throws" });
    await expect(startSlackConnect(ports)).rejects.toThrow("no browser");
    expect(steps.filter((step) => step === "cancel 7")).toHaveLength(1);
  });
});

describe("a web Slack connect", () => {
  it("names no return and binds nothing", async () => {
    const { steps, reported, ports } = harness({ desktop: false });
    expect(await startSlackConnect(ports)).toEqual({ url: URL, opened: true });
    expect(steps).toEqual(["connect null", `open ${URL}`]);
    expect(reported).toEqual([]);
  });
});
