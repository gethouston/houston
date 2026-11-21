import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = readFileSync(
  new URL("../src/components/use-chat-sender-avatars.tsx", import.meta.url),
  "utf8",
);

describe("chat sender identity", () => {
  it("uses the transcript-aware selector and never passes a hard `false`", () => {
    ok(
      src.includes("chatSenderMode("),
      "showSenders comes from the transcript-aware selector",
    );
    ok(
      !/showSenders\s*[:=]\s*false/.test(src),
      "no code path pins showSenders to false",
    );
    ok(
      src.includes("showSenders: true | undefined"),
      "the exported type forbids `false` at compile time",
    );
  });

  it("gives the sender face the author id, so the person tone applies", () => {
    ok(
      /<PersonFace[\s\S]*?id:\s*author\.userId/.test(src),
      "PersonFace receives the author's userId as its stable id",
    );
  });

  it("never labels a face with a raw user id", () => {
    ok(
      src.includes("shortUserLabel(author.userId)"),
      "a nameless author falls back to the shared short-id label",
    );
    ok(
      !/author\.name\s*\?\?\s*author\.userId/.test(src),
      "no raw-userId fallback remains",
    );
  });
});
