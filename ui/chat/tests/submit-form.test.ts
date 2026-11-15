// Enter in the composer must send on a WebKit without `requestSubmit`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { submitForm } from "../src/submit-form.ts";

describe("submitForm", () => {
  it("uses requestSubmit when the engine has it", () => {
    let requested = 0;
    const events: Event[] = [];
    const form = {
      requestSubmit: () => requested++,
      dispatchEvent: (e: Event) => events.push(e) > 0,
    } as unknown as HTMLFormElement;
    submitForm(form);
    assert.equal(requested, 1);
    assert.equal(events.length, 0);
  });

  it("dispatches a cancelable bubbling submit on an older WebKit", () => {
    const events: Event[] = [];
    const form = {
      dispatchEvent: (e: Event) => events.push(e) > 0,
    } as unknown as HTMLFormElement;
    submitForm(form);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "submit");
    assert.ok(events[0].bubbles);
    assert.ok(events[0].cancelable);
  });
});
