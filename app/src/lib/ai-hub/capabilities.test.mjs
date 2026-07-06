import assert from "node:assert/strict";
import test from "node:test";
import { capabilitiesOf, priceTier } from "./capabilities.ts";

/** Build a minimal CatalogModel with the fields these helpers read. */
function model(fields) {
  return {
    key: "k",
    name: "M",
    lab: "other",
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers: [],
    ...fields,
  };
}

/** A model priced at a single input cost per Mtok (one paid offer). */
function priced(costInput) {
  return model({
    offers: [
      {
        providerId: "openrouter",
        modelId: "m",
        subscription: false,
        costInput,
      },
    ],
  });
}

test("capabilitiesOf: vision comes from image input modality", () => {
  assert.deepEqual(
    [...capabilitiesOf(model({ inputModalities: ["text", "image"] }))],
    ["vision"],
  );
  assert.deepEqual(
    [...capabilitiesOf(model({ inputModalities: ["text"] }))],
    [],
  );
});

test("capabilitiesOf: reasoning comes from the reasoning flag", () => {
  assert.ok(capabilitiesOf(model({ reasoning: true })).has("reasoning"));
  assert.ok(!capabilitiesOf(model({ reasoning: false })).has("reasoning"));
});

test("capabilitiesOf: tools comes from the toolCall flag", () => {
  assert.ok(capabilitiesOf(model({ toolCall: true })).has("tools"));
  assert.ok(!capabilitiesOf(model({ toolCall: false })).has("tools"));
});

test("capabilitiesOf: imageGen comes from the imageGen flag", () => {
  assert.ok(capabilitiesOf(model({ imageGen: true })).has("imageGen"));
  assert.ok(!capabilitiesOf(model({ imageGen: false })).has("imageGen"));
});

test("capabilitiesOf: a snapshot-only model (imageGen false) never emits imageGen", () => {
  const snapshotOnly = model({
    reasoning: true,
    toolCall: true,
    inputModalities: ["image"],
  });
  assert.ok(!capabilitiesOf(snapshotOnly).has("imageGen"));
});

test("capabilitiesOf: multiple capabilities combine", () => {
  const caps = capabilitiesOf(
    model({
      reasoning: true,
      toolCall: true,
      imageGen: true,
      inputModalities: ["text", "image"],
    }),
  );
  assert.deepEqual([...caps].sort(), [
    "imageGen",
    "reasoning",
    "tools",
    "vision",
  ]);
});

test("priceTier: boundaries at 0, <1, <5, >=5", () => {
  assert.equal(priceTier(priced(0)), "free");
  assert.equal(priceTier(priced(0.99)), "low");
  assert.equal(priceTier(priced(1)), "mid");
  assert.equal(priceTier(priced(4.99)), "mid");
  assert.equal(priceTier(priced(5)), "high");
});

test("priceTier: cheapest offer wins across offers", () => {
  const m = model({
    offers: [
      { providerId: "a", modelId: "m", subscription: false, costInput: 8 },
      { providerId: "b", modelId: "m", subscription: false, costInput: 0.5 },
    ],
  });
  assert.equal(priceTier(m), "low");
});

test("priceTier: missing pricing is undefined, not free", () => {
  // No offers at all.
  assert.equal(priceTier(model()), undefined);
  // A subscription-only offer carries no per-token price.
  assert.equal(
    priceTier(
      model({
        offers: [{ providerId: "anthropic", modelId: "m", subscription: true }],
      }),
    ),
    undefined,
  );
});
