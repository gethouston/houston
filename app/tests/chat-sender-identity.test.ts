import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Chat sender identity (HOU-943). The node test runner has no DOM, so (per the
 * repo's React-test idiom) these assert on the hook's source — they pin two
 * decisions that are invisible in a screenshot and easy to regress:
 *
 *  1. `showSenders` is `true` or `undefined`, NEVER `false`. `true` forces
 *     attribution on in a multiplayer deployment; `undefined` hands the call to
 *     `ui/chat`'s ≥2-distinct-authors heuristic — which is what must govern
 *     during the capabilities-loading window (else a shared transcript paints
 *     unattributed and then pops names in) and on any host that serves an
 *     authored transcript without advertising multiplayer. A hard `false` would
 *     make that heuristic unreachable and SUPPRESS attribution.
 *  2. The sender face carries the author's stable `id`, which is what gives the
 *     initials fallback their opaque `person.*` tone — one person, one tone,
 *     identical to their face on every board card.
 */

const src = readFileSync(
  new URL("../src/components/use-chat-sender-avatars.tsx", import.meta.url),
  "utf8",
);

describe("chat sender identity", () => {
  it("never passes a hard `false` for showSenders", () => {
    ok(
      src.includes("isMultiplayer(capabilities) || undefined"),
      "showSenders is true in multiplayer, undefined everywhere else",
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
