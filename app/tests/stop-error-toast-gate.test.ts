import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// A Stop pressed while the agent's pod is still cold-starting: the cancel POST
// answers the gateway's waking 502 ("engine proxy failed", the pod's service
// name not resolving yet). `call("stop_session")` classified it and showed the
// deduped "your agent is waking up" notice, then rethrew — and the stop catch
// added a SECOND, red "Couldn't stop the task: <raw dial error>" toast on top,
// so the user read the pair as the conversation being broken. Same
// layered-gate shape as the rejection handler (engine-waking-rejection-gate
// .test.ts): every catch that toasts after `call()` must decline the quiet
// classes `call()` already surfaced.
//
// Asserted against the source: the helper pulls i18n and the Zustand store,
// neither of which loads under this suite's `--experimental-strip-types`
// runner (same constraint as error-toast-not-shown.test.ts).

const read = (rel: string): string =>
  readFileSync(join(import.meta.dirname, rel), "utf8");

describe("showStopFailedToast declines already-surfaced failures", () => {
  const source = read("../src/lib/stop-error-toast.ts");
  const body = source.slice(
    source.indexOf("export function showStopFailedToast("),
  );
  const guard = body.indexOf(
    "if (isEngineWakingError(err) || isNetworkTransportError(err)) return;",
  );
  const toast = body.indexOf("addToast(");

  it("imports both quiet-class classifiers", () => {
    ok(source.includes('from "./engine-waking-error"'));
    ok(source.includes('from "./network-transport-error"'));
  });

  it("gates the red toast on waking and connectivity", () => {
    ok(guard !== -1, "the helper must decline waking/connectivity errors");
    ok(toast !== -1, "every other failure keeps its toast");
    ok(guard < toast, "the guard must run before the toast");
  });

  it("keeps the authored stop copy for real failures", () => {
    ok(body.includes('i18n.t("chat:errors.stopSession"'));
  });
});

describe("every Stop catch routes through the shared helper", () => {
  for (const rel of [
    "../src/components/board/use-agent-board-send.ts",
    "../src/components/board/use-mc-actions.ts",
  ]) {
    it(`${rel} uses showStopFailedToast`, () => {
      const source = read(rel);
      ok(source.includes('from "../../lib/stop-error-toast"'));
      const stop = source.slice(source.indexOf("tauriChat"));
      const stopCall = stop.indexOf(".stop(");
      ok(stopCall !== -1, "the stop call must exist");
      const after = stop.slice(stopCall);
      const catchAt = after.indexOf(".catch(showStopFailedToast)");
      ok(catchAt !== -1, "the stop catch must be the shared helper");
      ok(
        !after.slice(0, catchAt).includes("errors.stopSession"),
        "no inline stop toast may remain ahead of the helper",
      );
    });
  }
});
