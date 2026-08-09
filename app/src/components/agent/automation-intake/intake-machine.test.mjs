import assert from "node:assert/strict";
import { test } from "node:test";
import {
  forkDestination,
  pickedOptionId,
  wakeDestination,
} from "./intake-machine.ts";

test("forkDestination: skipping the fork goes AI-led", () => {
  assert.equal(forkDestination(null, true), "aiLed");
  assert.equal(forkDestination(null, false), "aiLed");
});

test("forkDestination: template choice opens the template picker", () => {
  assert.equal(forkDestination("template", true), "template");
  assert.equal(forkDestination("template", false), "template");
});

test("forkDestination: 'know' asks the wake only where triggers exist", () => {
  assert.equal(forkDestination("know", true), "wake");
  // No event triggers: the wake question would have one option, so skip it.
  assert.equal(forkDestination("know", false), "schedule");
});

test("wakeDestination: skipping the wake goes AI-led", () => {
  assert.equal(wakeDestination(null), "aiLed");
});

test("wakeDestination: each wake maps to its detail card", () => {
  assert.equal(wakeDestination("schedule"), "schedule");
  assert.equal(wakeDestination("trigger"), "trigger");
  assert.equal(wakeDestination("webhook"), "webhook");
});

test("pickedOptionId: matches the answer label back to its option id", () => {
  const options = [
    { id: "know", label: "From scratch" },
    { id: "template", label: "Start from a template" },
  ];
  assert.equal(
    pickedOptionId(options, [{ answer: "Start from a template" }]),
    "template",
  );
});

test("pickedOptionId: an empty answers array (skipped) is null", () => {
  const options = [{ id: "know", label: "From scratch" }];
  assert.equal(pickedOptionId(options, []), null);
});

test("pickedOptionId: an unrecognized answer is null", () => {
  const options = [{ id: "know", label: "From scratch" }];
  assert.equal(pickedOptionId(options, [{ answer: "something else" }]), null);
});
