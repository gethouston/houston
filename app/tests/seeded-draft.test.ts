import { deepStrictEqual, strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  endDraftSeed,
  newTaskHeldBySeed,
  seedDraft,
  seededDraftKey,
  useDraftStore,
} from "../src/stores/drafts.ts";

// A New task composer opened with words already typed in (the Academy's email
// lesson) shows them from a slot of their own. What the user had parked in the
// composer, words and files, is never touched, sent or not, however the send
// and the seed's end interleave.

const KEY = "new-conversation:mission-control:t1";
const file = new File(["x"], "brief.pdf");
const store = () => useDraftStore.getState();
/** The slot the composer at KEY reads and writes right now. */
const shownKey = () => seededDraftKey(store().seed, KEY);
const shown = () => store().drafts[shownKey()]?.text ?? "";

function park() {
  store().setDraftText(KEY, "my half-written brief");
  store().setDraftFiles(KEY, [file]);
}
const parked = () => store().drafts[KEY];

describe("seeded drafts", () => {
  beforeEach(() => store().reset());

  it("shows the seeded words alone and leaves the parked draft as it was", () => {
    park();
    seedDraft(KEY, "Send me an email");
    strictEqual(shown(), "Send me an email");
    deepStrictEqual(parked(), { text: "my half-written brief", files: [file] });
  });

  it("keeps the parked draft when the seed ends during a send in flight", () => {
    park();
    const end = seedDraft(KEY, "Send me an email");
    // Send pressed: the composer empties the slot it was pressed in once the
    // send lands.
    const pressedIn = shownKey();
    end(); // the lesson is left while the send is in flight
    store().setDraftText(pressedIn, ""); // the send lands
    deepStrictEqual(parked(), { text: "my half-written brief", files: [file] });
    strictEqual(shown(), "my half-written brief");
  });

  it("keeps the parked draft when the send lands before the seed ends", () => {
    park();
    const end = seedDraft(KEY, "Send me an email");
    store().setDraftText(shownKey(), "");
    end();
    strictEqual(shown(), "my half-written brief");
    strictEqual(store().seed, null);
  });

  it("gives the composer its own draft back when the seed ends unsent", () => {
    park();
    const end = seedDraft(KEY, "Send me an email");
    end();
    deepStrictEqual(parked(), { text: "my half-written brief", files: [file] });
    strictEqual(shown(), "my half-written brief");
    strictEqual(Object.keys(store().drafts).length, 1);
  });

  it("ends once, and never ends a newer seed", () => {
    const first = seedDraft(KEY, "first");
    first();
    const second = seedDraft(KEY, "second");
    first();
    strictEqual(shown(), "second");
    second();
    strictEqual(store().seed, null);
  });

  it("gives way to a composer opened by hand", () => {
    park();
    const end = seedDraft(KEY, "Send me an email");
    endDraftSeed();
    strictEqual(shown(), "my half-written brief");
    end();
    strictEqual(shown(), "my half-written brief");
  });

  it("stands over its own slot only", () => {
    seedDraft(KEY, "Send me an email");
    const other = "new-conversation:mission-control:t2";
    strictEqual(seededDraftKey(store().seed, other), other);
  });

  it("is dropped with every draft on an identity change", () => {
    seedDraft(KEY, "Send me an email");
    store().reset();
    strictEqual(store().seed, null);
    strictEqual(shown(), "");
  });

  it("keeps a newer run's words when an older run's send lands late", () => {
    const endFirst = seedDraft(KEY, "Send me an email");
    // Send is pressed in the first run: the board captures the slot it shows.
    const pressedIn = shownKey();
    endFirst();
    seedDraft(KEY, "Send me an email");
    // The first run's create resolves now and empties the slot it captured.
    store().setDraftText(pressedIn, "");
    strictEqual(shown(), "Send me an email");
  });

  it("holds New task while a seed stands, and lets it go once it ends", () => {
    strictEqual(newTaskHeldBySeed(), false);
    const end = seedDraft(KEY, "Send me an email");
    strictEqual(newTaskHeldBySeed(), true);
    end();
    strictEqual(newTaskHeldBySeed(), false);
  });
});
