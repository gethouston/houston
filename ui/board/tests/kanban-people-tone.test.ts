import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  PERSON_NAME_TONE_CLASSES,
  PERSON_TONE_CLASSES,
  personNameToneClass,
  personToneClass,
  personToneIndex,
} from "../src/kanban-people-tone.ts";

/**
 * The face-stack tone rule. The product promise these guard: the SAME teammate
 * wears the SAME colour on every card, in every column, on both boards and in
 * the expansion popover — so a face stack is scannable rather than a lottery.
 */

describe("personToneIndex", () => {
  it("stays inside the palette", () => {
    for (const id of ["", "a", "u-alice", "u-bob", "🙂", "x".repeat(500)]) {
      const i = personToneIndex(id);
      assert.ok(Number.isInteger(i), `${id} -> ${i} is not an integer`);
      assert.ok(i >= 0 && i < PERSON_TONE_CLASSES.length, `${id} -> ${i}`);
    }
  });

  it("is deterministic — the same id always hashes the same", () => {
    const id = "u-7f3a91c2";
    assert.equal(personToneIndex(id), personToneIndex(id));
    assert.equal(personToneIndex(id), personToneIndex(`${id}`.slice(0)));
  });

  it("is case- and character-sensitive (distinct ids may differ)", () => {
    // Not a guarantee of inequality for any given pair, but the hash must not
    // collapse near-identical ids by construction (a char-sum hash would).
    const ids = ["u-alice", "u-alexis", "u-alicia", "u-alison"];
    const tones = new Set(ids.map(personToneIndex));
    assert.ok(tones.size > 1, "near-identical ids all landed on one tone");
  });

  it("spreads a realistic roster across the whole palette", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `u-${i.toString(16)}`);
    const used = new Set(ids.map(personToneIndex));
    assert.equal(used.size, PERSON_TONE_CLASSES.length);
  });
});

describe("personToneClass", () => {
  it("returns a palette class, never an ad-hoc string", () => {
    const cls = personToneClass("u-alice");
    assert.ok(
      (PERSON_TONE_CLASSES as readonly string[]).includes(cls),
      `${cls} is not in the palette`,
    );
  });

  it("gives one person one tone across every render site", () => {
    const id = "u-bob";
    assert.equal(personToneClass(id), personToneClass(id));
  });

  it("uses only tokenized person utilities (no raw colour)", () => {
    for (const cls of PERSON_TONE_CLASSES) {
      assert.match(cls, /^bg-person-[a-z]+$/);
    }
  });
});

/**
 * The name tone is the same identity as the fill, retuned for text contrast.
 * The guarantee under test: a teammate's avatar and their attributed name in a
 * chat bubble are never two different colours.
 */
describe("personNameToneClass", () => {
  it("gives one person one tone across every render site", () => {
    const id = "u-bob";
    assert.equal(personNameToneClass(id), personNameToneClass(id));
  });

  it("returns a palette class, never an ad-hoc string", () => {
    const cls = personNameToneClass("u-alice");
    assert.ok(
      (PERSON_NAME_TONE_CLASSES as readonly string[]).includes(cls),
      `${cls} is not in the name palette`,
    );
  });

  it("uses only tokenized person-name utilities (no raw colour)", () => {
    for (const cls of PERSON_NAME_TONE_CLASSES) {
      assert.match(cls, /^text-person-name-[a-z]+$/);
    }
  });

  it("has the same length as the fill palette", () => {
    assert.equal(PERSON_NAME_TONE_CLASSES.length, PERSON_TONE_CLASSES.length);
  });

  it("picks the SAME palette index as the fill, for every id", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `u-${i.toString(16)}`);
    for (const id of [...ids, "", "🙂", "u-alice", "x".repeat(500)]) {
      const fill = (PERSON_TONE_CLASSES as readonly string[]).indexOf(
        personToneClass(id),
      );
      const name = (PERSON_NAME_TONE_CLASSES as readonly string[]).indexOf(
        personNameToneClass(id),
      );
      assert.equal(
        name,
        fill,
        `${id}: fill tone #${fill} but name tone #${name} — a person's avatar and name diverged`,
      );
    }
  });

  it("spreads a realistic roster across the whole name palette", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `u-${i.toString(16)}`);
    const used = new Set(ids.map(personNameToneClass));
    assert.ok(used.size >= 3, `only ${used.size} distinct name tones used`);
    assert.equal(used.size, PERSON_NAME_TONE_CLASSES.length);
  });
});
