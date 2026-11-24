import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

// The SDK types its restart lines (`notice: "engine_restart" | "engine_resumed"`)
// and the app renders `chat:engineRestart.*` by kind (PRODUCT-1785). Both keys
// must exist and be authored, not copied from English, in every shipped
// language.
describe("engine-restart chat copy", () => {
  it("is authored in every shipped language", () => {
    for (const key of ["sayContinue", "resuming"] as const) {
      strictEqual(typeof en.engineRestart[key], "string");
      strictEqual(en.engineRestart[key] === "", false);
      for (const bundle of [es, pt]) {
        strictEqual(typeof bundle.engineRestart[key], "string");
        strictEqual(bundle.engineRestart[key] === "", false);
        strictEqual(bundle.engineRestart[key] === en.engineRestart[key], false);
      }
    }
  });

  it("authors the lost-sandbox line without the restart promise", () => {
    for (const bundle of [en, es, pt]) {
      strictEqual(typeof bundle.sandboxLost, "string");
      strictEqual(bundle.sandboxLost === "", false);
      strictEqual(
        bundle.sandboxLost === bundle.engineRestart.sayContinue,
        false,
      );
    }
    strictEqual(/continue/i.test(en.sandboxLost), false);
    strictEqual(es.sandboxLost === en.sandboxLost, false);
    strictEqual(pt.sandboxLost === en.sandboxLost, false);
  });
});
