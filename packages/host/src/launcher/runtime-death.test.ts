import { expect, test, vi } from "vitest";
import type { Agent } from "../domain/types";
import {
  describeExit,
  RuntimeDiedError,
  reportRuntimeDeath,
} from "./runtime-death";

test("describeExit keeps the raw pair and reads the usual pod deaths", () => {
  expect(describeExit({ code: null, signal: "SIGKILL", stderrTail: [] })).toBe(
    "code=none signal=SIGKILL (killed: cgroup OOM or an external kill)",
  );
  expect(describeExit({ code: 134, signal: null, stderrTail: [] })).toContain(
    "heap limit",
  );
  expect(
    describeExit({ code: null, signal: "SIGABRT", stderrTail: [] }),
  ).toContain("heap limit");
  expect(describeExit({ code: 1, signal: null, stderrTail: [] })).toBe(
    "code=1 signal=none (exited 1: an uncaught exception the runtime logged)",
  );
  expect(describeExit({ code: null, signal: null, stderrTail: [] })).toContain(
    "never spawned",
  );
});

test("RuntimeDiedError titles by the exit shape and carries the stderr tail", () => {
  const err = new RuntimeDiedError("a1", {
    code: null,
    signal: "SIGABRT",
    stderrTail: [
      "FATAL ERROR: Reached heap limit",
      "1: 0xb8a0e0 node::Abort()",
    ],
  });
  expect(err.name).toBe("RuntimeDiedError");
  expect(err.message.split("\n")[0]).toBe(
    "runtime died unrequested: code=none signal=SIGABRT (aborted: a V8 fatal error such as the heap limit) agent=a1",
  );
  expect(err.message).toContain("Reached heap limit");
  expect(err.exit.signal).toBe("SIGABRT");
});

test("reportRuntimeDeath logs one error line with the typed error for the capture feed", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  reportRuntimeDeath({ id: "a1", name: "Ram" } as Agent, {
    code: null,
    signal: "SIGKILL",
    stderrTail: [],
  });
  expect(spy).toHaveBeenCalledTimes(1);
  const [line, error] = spy.mock.calls[0] ?? [];
  expect(line).toContain("runtime for 'a1' died unrequested");
  expect(error).toBeInstanceOf(RuntimeDiedError);
  spy.mockRestore();
});
