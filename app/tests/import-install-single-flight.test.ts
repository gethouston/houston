import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PortableInstalledAgent } from "@houston/engine-adapter";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import {
  type ImportInstallRun,
  runImportInstall,
} from "../src/components/portable/import-install-flow.ts";
import type { InstallImportedAgentArgs } from "../src/components/portable/import-install-request.ts";
import { createSingleFlight } from "../src/components/portable/single-flight.ts";

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
  press: () => Promise<void>;
  installs: InstallImportedAgentArgs[];
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
    reportNameTaken: () => steps.push("nameTaken"),
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

  it("tells the user the name is taken when the host refuses it as another agent's", async () => {
    const harness = pressHarness(() =>
      Promise.reject(
        new HoustonEngineError(409, {
          error: 'an agent named "Scout" already exists in this workspace',
          code: "name_taken",
        }),
      ),
    );

    await harness.press();

    deepStrictEqual(harness.steps, [
      "installing:true",
      "nameTaken",
      "installing:false",
    ]);
  });

  it("does nothing until the sheet knows the package and the workspace", async () => {
    const harness = pressHarness(async () => INSTALLED, { args: null });

    await harness.press();

    strictEqual(harness.installs.length, 0);
    deepStrictEqual(harness.steps, []);
  });
});
