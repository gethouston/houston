import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

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
});
