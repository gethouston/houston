import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { NOTICE_COPY } from "../src/components/chat-notice-copy.ts";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

describe("chat notice copy", () => {
  it("resolves every notice in every shipped language", () => {
    for (const key of Object.values(NOTICE_COPY)) {
      const path = key.replace(/^chat:/, "").split(".");
      for (const bundle of [en, es, pt]) {
        let node: unknown = bundle;
        for (const part of path)
          node = (node as Record<string, unknown> | undefined)?.[part];
        strictEqual(typeof node, "string", key);
        strictEqual((node as string).includes("—"), false, key);
      }
    }
  });
});
