import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

/**
 * `app/src/lib/engine-restart-line.ts` swaps these two English SDK lines
 * (`ENGINE_RESTART_MESSAGE` / `ENGINE_RESUMED_MESSAGE`) for translated copy by
 * exact value. The constants cannot be imported here — this suite runs on
 * `node --test`, which cannot resolve the SDK's extensionless internals — so
 * the literals are pinned on BOTH sides: here against the English locale, and
 * in `packages/sdk/src/modules/turns/turn-errors.test.ts` against the
 * constants. A change to either without the other fails one of the two.
 */
const ENGINE_RESTART_MESSAGE =
  "Your agent had to restart. Say continue and it will pick up where it left off.";
const ENGINE_RESUMED_MESSAGE =
  "Your agent was interrupted by a restart and is picking up where it left off.";

describe("engine-restart chat copy", () => {
  it("renders the SDK's own wording in English — the swap is invisible", () => {
    strictEqual(en.engineRestart.sayContinue, ENGINE_RESTART_MESSAGE);
    strictEqual(en.engineRestart.resuming, ENGINE_RESUMED_MESSAGE);
  });

  it("is authored, not English, in every other shipped language", () => {
    for (const bundle of [es, pt]) {
      strictEqual(typeof bundle.engineRestart.sayContinue, "string");
      strictEqual(bundle.engineRestart.sayContinue === "", false);
      strictEqual(
        bundle.engineRestart.sayContinue === en.engineRestart.sayContinue,
        false,
      );
      strictEqual(
        bundle.engineRestart.resuming === en.engineRestart.resuming,
        false,
      );
    }
  });
});
