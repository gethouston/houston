import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { beforeEach, describe, it, mock } from "node:test";
import "./support/dom-env.ts";
import { claimLaunchCheck } from "../src/lib/update-launch-claim.ts";

type Shell = {
  invoke: (cmd: string, args?: unknown) => Promise<unknown>;
  transformCallback: () => number;
};

const commands: Array<[string, unknown]> = [];
let draft = false;
let draftDuringBundlePath = false;
(window as unknown as { __TAURI_INTERNALS__: Shell }).__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    commands.push([cmd, args]);
    switch (cmd) {
      case "plugin:updater|check":
        return {
          rid: 7,
          available: true,
          currentVersion: "0.6.23",
          version: "1.0.8",
          date: null,
          body: null,
          rawJson: {},
        };
      case "download_update":
        return 9;
      case "current_app_bundle_path":
        if (draftDuringBundlePath) draft = true;
        return "/Applications/Houston.app";
      default:
        return undefined;
    }
  },
  transformCallback: () => 1,
};
const tracked: Array<[string, unknown]> = [];
mock.module(new URL("../src/lib/analytics.ts", import.meta.url).href, {
  namedExports: {
    analytics: {
      track: (name: string, props: unknown) => {
        tracked.push([name, props]);
      },
    },
  },
});
mock.module(new URL("../src/lib/error-report.ts", import.meta.url).href, {
  namedExports: { reportError: () => undefined },
});
mock.module(
  new URL("../src/lib/update-download-report.ts", import.meta.url).href,
  { namedExports: { reportUpdateDownloadFailure: () => undefined } },
);

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { useUpdateMachine } = await import("../src/hooks/use-update-machine.ts");
type Machine = ReturnType<typeof useUpdateMachine>;

claimLaunchCheck();

const pollInfo = { currentVersion: "0.6.23", version: "1.0.8", origin: "poll" };

async function stagedMachine() {
  let api: Machine | null = null;
  const statuses: Machine["status"][] = [];
  function Probe() {
    api = useUpdateMachine({ returnHold: () => (draft ? "draft" : null) });
    statuses.push(api.status);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(h(Probe)));
  if (!api) throw new Error("hook did not render");
  const machine: Machine = api;
  await act(async () => {
    await machine.runCheck();
  });
  await act(async () => {
    await machine.download("poll");
  });
  deepStrictEqual(statuses.at(-1), { state: "downloaded", info: pollInfo });
  commands.length = 0;
  tracked.length = 0;
  return { machine, statuses, root };
}

const sent = (cmd: string) => commands.filter(([name]) => name === cmd);

describe("a return's install", () => {
  beforeEach(() => {
    commands.length = 0;
    tracked.length = 0;
    draft = false;
    draftDuringBundlePath = false;
  });

  it("holds when a draft appears after the gate but before the install", async () => {
    const { machine, statuses, root } = await stagedMachine();
    draftDuringBundlePath = true;
    await act(async () => {
      await machine.installAndRelaunch("return");
    });
    deepStrictEqual(sent("install_update"), []);
    deepStrictEqual(sent("relaunch_app_from_path"), []);
    deepStrictEqual(statuses.at(-1), { state: "downloaded", info: pollInfo });
    deepStrictEqual(tracked, [["update_return_held", { reason: "draft" }]]);
    await act(async () => root.unmount());
  });

  it("commits the installing state before its first await", async () => {
    const { machine, statuses, root } = await stagedMachine();
    await act(async () => {
      void machine.installAndRelaunch("return");
      deepStrictEqual(statuses.at(-1), {
        state: "installing",
        info: { ...pollInfo, origin: "return" },
      });
    });
    await act(async () => root.unmount());
  });

  it("installs and relaunches when nothing slipped in", async () => {
    const { machine, root } = await stagedMachine();
    await act(async () => {
      await machine.installAndRelaunch("return");
    });
    deepStrictEqual(sent("install_update"), [
      ["install_update", { rid: 7, bytes_rid: 9 }],
    ]);
    deepStrictEqual(sent("relaunch_app_from_path"), [
      ["relaunch_app_from_path", { app_path: "/Applications/Houston.app" }],
    ]);
    deepStrictEqual(tracked, [
      [
        "update_accepted",
        { from_version: "0.6.23", to_version: "1.0.8", source: "return" },
      ],
    ]);
    ok(
      commands.findIndex(([n]) => n === "current_app_bundle_path") <
        commands.findIndex(([n]) => n === "install_update"),
      "the bundle path is captured before the install moves it",
    );
    strictEqual(draft, false);
    await act(async () => root.unmount());
  });

  it("never holds the person's own click on the pill", async () => {
    const { machine, root } = await stagedMachine();
    draft = true;
    await act(async () => {
      await machine.installAndRelaunch("user");
    });
    deepStrictEqual(sent("install_update"), [
      ["install_update", { rid: 7, bytes_rid: 9 }],
    ]);
    deepStrictEqual(tracked, [
      [
        "update_accepted",
        { from_version: "0.6.23", to_version: "1.0.8", source: "user" },
      ],
    ]);
    await act(async () => root.unmount());
  });
});
