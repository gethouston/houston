import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PortableInstalledAgent } from "@houston/engine-adapter";
import {
  type ImportInstallRun,
  runImportInstall,
} from "../src/components/portable/import-install-flow.ts";
import type { InstallImportedAgentArgs } from "../src/components/portable/import-install-request.ts";
import { createSingleFlight } from "../src/components/portable/single-flight.ts";

/**
 * Rage-clicking "Install" on the last step of "From a friend" created TWO
 * agents: `setInstalling(true)` is a React state update, so the button's
 * `disabled` only lands on the NEXT render and both clicks of a same-tick burst
 * passed the check. The latch below flips synchronously, which is what actually
 * closes that window; `AsyncButton` is what holds the press visually.
 */

describe("createSingleFlight", () => {
  it("drops a second call made in the SAME tick as the first", async () => {
    const runOnce = createSingleFlight();
    let calls = 0;
    let finish: (value: string) => void = () => undefined;
    const install = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };

    const first = runOnce(install);
    const second = runOnce(install);

    strictEqual(calls, 1, "the second click never reaches the round-trip");
    strictEqual(await second, undefined, "the dropped call answers nothing");
    finish("agent");
    strictEqual(await first, "agent", "the first call still returns its value");
  });

  it("releases once the action resolves", async () => {
    const runOnce = createSingleFlight();
    strictEqual(await runOnce(async () => "one"), "one");
    strictEqual(await runOnce(async () => "two"), "two");
  });

  it("releases once the action rejects, and propagates the rejection", async () => {
    const runOnce = createSingleFlight();
    await rejects(
      () =>
        runOnce(() =>
          Promise.reject(new Error("install failed")),
        ) as Promise<unknown>,
      /install failed/,
    );
    strictEqual(
      await runOnce(async () => "after"),
      "after",
      "a failed install does not latch the button shut forever",
    );
  });
});

/**
 * The press itself. The node runner has no DOM, so the hook's composition —
 * `installOnce.current(() => runImportInstall(…))`, the latch held in a ref
 * across renders — is rebuilt here over the same two modules and driven for
 * real: the engine port counts its calls, so "one install per burst" is a
 * measured fact rather than a shape the source happens to have.
 */
const ARGS: InstallImportedAgentArgs = {
  packageId: "pkg_1",
  workspaceName: "Personal",
  agentName: "Scout",
  agentColor: "violet",
  include: { skillSlugs: ["inbox"], routineIds: [], learningIds: [] },
};

const INSTALLED = {
  agentName: "Scout",
  agentPath: "/w/Personal/Scout",
} as PortableInstalledAgent;

interface Press {
  /** What the button's onClick does, latch included. */
  press: () => Promise<void>;
  /** Every engine round-trip that actually left. */
  installs: InstallImportedAgentArgs[];
  /** The steps the user sees, in the order they happened. */
  steps: string[];
}

function pressHarness(
  install: (args: InstallImportedAgentArgs) => Promise<PortableInstalledAgent>,
  over: Partial<ImportInstallRun> = {},
): Press {
  const installs: InstallImportedAgentArgs[] = [];
  const steps: string[] = [];
  const runOnce = createSingleFlight();
  const run: ImportInstallRun = {
    args: ARGS,
    nameProblem: () => null,
    resolveKickoffPin: () => ({ provider: "anthropic", model: "opus" }),
    install: (args) => {
      installs.push(args);
      return install(args);
    },
    reveal: () => steps.push("reveal"),
    reportNameProblem: (problem) => steps.push(`nameProblem:${problem}`),
    reportFailure: () => steps.push("failure"),
    setInstalling: (installing) => steps.push(`installing:${installing}`),
    ...over,
  };
  return { press: () => runOnce(() => runImportInstall(run)), installs, steps };
}

describe("the import wizard's install action", () => {
  it("makes ONE round-trip for a same-tick double press", async () => {
    let finish: (value: PortableInstalledAgent) => void = () => undefined;
    const harness = pressHarness(
      () =>
        new Promise<PortableInstalledAgent>((resolve) => (finish = resolve)),
    );

    const first = harness.press();
    const second = harness.press();

    strictEqual(harness.installs.length, 1, "the second press never left");
    finish(INSTALLED);
    await Promise.all([first, second]);
    strictEqual(harness.installs.length, 1, "and none left afterwards either");
    deepStrictEqual(harness.installs[0], ARGS);
  });

  it("hands the press a promise that settles with the round-trip", async () => {
    let finish: (value: PortableInstalledAgent) => void = () => undefined;
    const harness = pressHarness(
      () =>
        new Promise<PortableInstalledAgent>((resolve) => (finish = resolve)),
    );

    // AsyncButton holds the button pending for exactly as long as this promise
    // is unsettled, so the handler must RETURN it rather than fire and forget.
    const pressed = harness.press();
    ok(pressed instanceof Promise);
    deepStrictEqual(harness.steps, ["installing:true"], "still in flight");
    finish(INSTALLED);
    await pressed;
    deepStrictEqual(harness.steps, [
      "installing:true",
      "reveal",
      "installing:false",
    ]);
  });

  it("releases the latch when the install fails, so a retry gets through", async () => {
    const harness = pressHarness(() =>
      Promise.reject(new Error("engine unreachable")),
    );

    await harness.press();
    deepStrictEqual(harness.steps, [
      "installing:true",
      "failure",
      "installing:false",
    ]);
    await harness.press();
    strictEqual(harness.installs.length, 2, "the button is not latched shut");
  });

  it("refuses an unusable name without touching the engine", async () => {
    const harness = pressHarness(async () => INSTALLED, {
      nameProblem: () => "That name is already taken",
    });

    await harness.press();

    strictEqual(harness.installs.length, 0);
    deepStrictEqual(harness.steps, ["nameProblem:That name is already taken"]);
  });

  it("does nothing until the sheet knows the package and the workspace", async () => {
    const harness = pressHarness(async () => INSTALLED, { args: null });

    await harness.press();

    strictEqual(harness.installs.length, 0);
    deepStrictEqual(harness.steps, []);
  });
});
