import { deepEqual, equal, ok } from "node:assert";
import { describe, it } from "node:test";
import {
  advanceDeck,
  createDeck,
  currentPhrase,
  DEFAULT_THINKING_PHRASES,
  type PhraseDeck,
  shuffle,
} from "../src/thinking-phrases.ts";

/** Deterministic RNG cycling through the given `[0, 1)` values. */
function seededRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Walk the deck for `steps` advances, collecting each phrase shown. */
function collect(deck: PhraseDeck, steps: number, random: () => number) {
  const seen = [currentPhrase(deck)];
  let cursor = deck;
  for (let s = 0; s < steps; s += 1) {
    cursor = advanceDeck(cursor, random);
    seen.push(currentPhrase(cursor));
  }
  return seen;
}

describe("shuffle", () => {
  it("returns a permutation of the input without mutating it", () => {
    const input = ["a", "b", "c", "d"];
    const out = shuffle(input, seededRandom([0.9, 0.1, 0.5]));
    deepEqual(input, ["a", "b", "c", "d"]);
    deepEqual([...out].sort(), ["a", "b", "c", "d"]);
  });

  it("is deterministic for a fixed RNG", () => {
    const rng = () => 0; // Fisher-Yates with j=0 reverses adjacent picks.
    deepEqual(
      shuffle(["a", "b", "c"], rng),
      shuffle(["a", "b", "c"], () => 0),
    );
  });
});

describe("createDeck", () => {
  it("starts at index 0 over a full permutation", () => {
    const deck = createDeck(["a", "b", "c"], seededRandom([0.4, 0.7, 0.2]));
    equal(deck.index, 0);
    deepEqual([...deck.order].sort(), ["a", "b", "c"]);
  });

  it("yields an empty deck for no phrases", () => {
    const deck = createDeck([], Math.random);
    deepEqual(deck.order, []);
    equal(currentPhrase(deck), "");
  });
});

describe("advanceDeck", () => {
  it("plays every phrase exactly once before any repeat", () => {
    const phrases = ["a", "b", "c", "d", "e"];
    const deck = createDeck(phrases, Math.random);
    const seen = collect(deck, phrases.length - 1, Math.random);
    deepEqual([...seen].sort(), [...phrases].sort());
    equal(new Set(seen).size, phrases.length);
  });

  it("reshuffles after exhausting the deck", () => {
    const phrases = ["a", "b", "c"];
    const deck = createDeck(phrases, Math.random);
    let cursor = deck;
    for (let s = 0; s < phrases.length; s += 1) {
      cursor = advanceDeck(cursor, Math.random);
    }
    equal(cursor.index, 0);
    deepEqual([...cursor.order].sort(), [...phrases].sort());
  });

  it("never repeats a phrase across the reshuffle seam", () => {
    const phrases = ["a", "b", "c", "d", "e"];
    // 200 advances over a 5-phrase deck crosses the seam many times.
    for (let seed = 0; seed < 50; seed += 1) {
      let cursor = createDeck(phrases, Math.random);
      let prev = currentPhrase(cursor);
      for (let s = 0; s < 200; s += 1) {
        cursor = advanceDeck(cursor, Math.random);
        const now = currentPhrase(cursor);
        ok(now !== prev, `repeated "${now}" back-to-back`);
        prev = now;
      }
    }
  });

  it("keeps the lone phrase when only one exists", () => {
    const deck = createDeck(["solo"], Math.random);
    const advanced = advanceDeck(deck, Math.random);
    equal(currentPhrase(advanced), "solo");
  });
});

describe("DEFAULT_THINKING_PHRASES", () => {
  it("ships a non-empty English fallback set", () => {
    ok(DEFAULT_THINKING_PHRASES.length >= 5);
    ok(DEFAULT_THINKING_PHRASES.every((p) => p.length > 0));
  });
});
