import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormDialog } from "../src/components/form-dialog.tsx";
import { FormDialogForm } from "../src/components/form-dialog-form.tsx";
import {
  FORM_DIALOG_SIZE_CLASS,
  handleFormSubmit,
  isCompositionEnter,
  refusesDismiss,
  resolveSecondary,
  runPendingAction,
} from "../src/components/form-dialog-parts.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

describe("FormDialog sizes", () => {
  it("caps both widths at sm:, so a phone keeps the dialog's gutter", () => {
    // An unprefixed max-w- is tailwind-merged over DialogContent's
    // max-w-[calc(100%-2rem)] base and the dialog goes edge-to-edge.
    for (const size of ["sm", "md"] as const) {
      assert.match(FORM_DIALOG_SIZE_CLASS[size], /^sm:max-w-/);
    }
    assert.equal(FORM_DIALOG_SIZE_CLASS.sm, "sm:max-w-sm");
    assert.equal(FORM_DIALOG_SIZE_CLASS.md, "sm:max-w-md");
    assert.deepEqual(Object.keys(FORM_DIALOG_SIZE_CLASS), ["sm", "md"]);
  });
});

describe("the secondary action", () => {
  it("defaults to the confirm's outline Cancel, and it closes the dialog", () => {
    let closed = 0;
    const cancel = resolveSecondary(undefined, "Cancel", () => {
      closed += 1;
    });
    assert.equal(cancel.label, "Cancel");
    assert.equal(cancel.variant, "outline");
    cancel.run();
    assert.equal(closed, 1);
  });

  it("takes the caller's label, localized, and still closes", () => {
    let closed = 0;
    const cancel = resolveSecondary({ label: "Descartar" }, "Cancelar", () => {
      closed += 1;
    });
    assert.equal(cancel.label, "Descartar");
    cancel.run();
    assert.equal(closed, 1);
  });

  it("hands an action with its own onClick the wheel, closing nothing", () => {
    // A "Back" that walks the caller's own steps must not dismiss the surface
    // the user is still inside.
    let closed = 0;
    let backed = 0;
    const cancel = resolveSecondary(
      {
        label: "Back",
        onClick: () => {
          backed += 1;
        },
      },
      "Cancel",
      () => {
        closed += 1;
      },
    );
    cancel.run();
    assert.equal(backed, 1);
    assert.equal(closed, 0);
  });

  it("carries disabled through and allows a destructive secondary", () => {
    const cancel = resolveSecondary(
      { label: "Discard", disabled: true, variant: "destructive" },
      "Cancel",
      () => undefined,
    );
    assert.equal(cancel.disabled, true);
    assert.equal(cancel.variant, "destructive");
  });
});

describe("the primary's promise", () => {
  it("closes immediately for a synchronous action", () => {
    const events: string[] = [];
    const inFlight = { current: false };
    const returned = runPendingAction(inFlight, () => undefined, {
      onPendingChange: (p) => events.push(`pending:${p}`),
      onResolved: () => events.push("closed"),
    });
    assert.equal(returned, undefined);
    assert.deepEqual(events, ["closed"]);
    assert.equal(inFlight.current, false);
  });

  it("stays open and pending until the promise resolves, then closes", async () => {
    const events: string[] = [];
    const inFlight = { current: false };
    let settle: () => void = () => {};
    const work = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const returned = runPendingAction(inFlight, () => work, {
      onPendingChange: (p) => events.push(`pending:${p}`),
      onResolved: () => events.push("closed"),
    });
    assert.deepEqual(events, ["pending:true"]);
    assert.equal(inFlight.current, true);
    settle();
    await returned;
    assert.deepEqual(events, ["pending:true", "pending:false", "closed"]);
    assert.equal(inFlight.current, false);
  });

  it("refuses re-entry while the work is in flight", () => {
    // The guard is a ref, not state: a same-frame rage click lands before
    // React commits the disabled button.
    let runs = 0;
    const inFlight = { current: false };
    const handlers = {
      onPendingChange: () => undefined,
      onResolved: () => undefined,
    };
    const start = () =>
      runPendingAction(
        inFlight,
        () => {
          runs += 1;
          return new Promise<void>(() => undefined);
        },
        handlers,
      );
    start();
    start();
    start();
    assert.equal(runs, 1);
  });

  it("leaves the dialog open on a rejection, and re-throws it", async () => {
    const events: string[] = [];
    const inFlight = { current: false };
    const returned = runPendingAction(
      inFlight,
      () => Promise.reject(new Error("name taken")),
      {
        onPendingChange: (p) => events.push(`pending:${p}`),
        onResolved: () => events.push("closed"),
      },
    );
    await assert.rejects(returned as Promise<unknown>, /name taken/);
    assert.deepEqual(events, ["pending:true", "pending:false"]);
    assert.equal(inFlight.current, false, "a failed save must be retryable");
  });
});

describe("Enter inside the form", () => {
  /** Never-settling work: the primary is left in flight for the whole test. */
  const inFlightPrimary = (count: { runs: number }) => {
    const inFlight = { current: false };
    return () =>
      handleFormSubmit({ preventDefault: () => undefined }, {}, () => {
        runPendingAction(
          inFlight,
          () => {
            count.runs += 1;
            return new Promise<void>(() => undefined);
          },
          {
            onPendingChange: () => undefined,
            onResolved: () => undefined,
          },
        );
      });
  };

  it("runs the primary once, and never lets the form navigate", () => {
    let prevented = 0;
    let runs = 0;
    handleFormSubmit(
      {
        preventDefault: () => {
          prevented += 1;
        },
      },
      {},
      () => {
        runs += 1;
      },
    );
    assert.equal(runs, 1);
    assert.equal(prevented, 1, "a submitting form must not navigate the page");
  });

  it("is ignored while the primary's promise is in flight", () => {
    const count = { runs: 0 };
    const submit = inFlightPrimary(count);
    submit();
    submit();
    submit();
    assert.equal(count.runs, 1);
  });

  it("is ignored when the primary is disabled", () => {
    let prevented = 0;
    let runs = 0;
    handleFormSubmit(
      {
        preventDefault: () => {
          prevented += 1;
        },
      },
      { disabled: true },
      () => {
        runs += 1;
      },
    );
    assert.equal(runs, 0, "an invalid form must not save");
    assert.equal(prevented, 1);
  });

  it("never submits on the keystroke that commits an IME composition", () => {
    assert.equal(
      isCompositionEnter({ key: "Enter", isComposing: true, keyCode: 229 }),
      true,
    );
    // Safari fires compositionend first and clears isComposing, leaving only
    // the legacy code behind.
    assert.equal(
      isCompositionEnter({ key: "Enter", isComposing: false, keyCode: 229 }),
      true,
    );
    assert.equal(
      isCompositionEnter({ key: "a", isComposing: true, keyCode: 229 }),
      false,
    );
  });

  it("leaves a plain Enter to the browser, so a textarea keeps its newline", () => {
    // The recipe cancels nothing on a real Enter: implicit submission is the
    // browser's, and the browser never submits from a <textarea>.
    assert.equal(
      isCompositionEnter({ key: "Enter", isComposing: false, keyCode: 13 }),
      false,
    );
  });
});

describe("the submittable frame", () => {
  const frame = (
    props: Partial<Parameters<typeof FormDialogForm>[0]> = {},
  ): string =>
    renderToStaticMarkup(
      createElement(FormDialogForm, {
        primary: { label: "Save name", pendingLabel: "Saving" },
        secondary: {
          label: "Cancel",
          variant: "outline",
          run: () => undefined,
        },
        pending: false,
        onSubmit: () => undefined,
        children: createElement("input", { "aria-label": "Agent name" }),
        ...props,
      }),
    );

  it("wraps the fields AND the footer in one form, so Enter in a field reaches it", () => {
    const html = frame();
    assert.match(html, /^<form /);
    const field = html.indexOf('aria-label="Agent name"');
    const footer = html.indexOf('data-slot="dialog-footer"');
    assert.ok(field > 0 && footer > field, "fields come before the footer");
    assert.ok(
      html.indexOf("</form>") > footer,
      "the footer's submit button belongs to the same form as the fields",
    );
  });

  it("makes the primary the form's only submit button; the secondary never submits", () => {
    const html = frame();
    const buttons = [
      ...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*/g),
    ].map((match) => match[0]);
    assert.equal(buttons.length, 2);
    assert.match(buttons[0], /type="button"/);
    assert.match(buttons[0], /Cancel/);
    assert.match(buttons[1], /type="submit"/);
    assert.equal(html.match(/type="submit"/g)?.length, 1);
  });

  it("wears the pending label and disables both buttons while in flight", () => {
    const html = frame({ pending: true });
    assert.match(html, /Saving/);
    assert.doesNotMatch(html, /Save name/);
    assert.equal(html.match(/disabled=""/g)?.length, 2);
    assert.match(html, /role="status"/, "the primary spins while it saves");
  });
});

describe("FormDialog renders", () => {
  it("mounts on its props and keeps everything inside the portal", () => {
    // Radix portals mount in an effect, which server rendering never runs, so
    // an open dialog renders nothing HERE. What this asserts is that the
    // recipe itself renders — no throw, no React warning — on the props an app
    // passes it.
    const complaints: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) =>
      complaints.push(args.map(String).join(" "));
    let html: string;
    try {
      html = renderToStaticMarkup(
        createElement(FormDialog, {
          open: true,
          onOpenChange: () => undefined,
          title: "Rename agent",
          description: "Inbox Zero keeps everything it already has.",
          size: "sm",
          primary: { label: "Save name", pendingLabel: "Saving" },
          children: null,
        }),
      );
    } finally {
      console.error = consoleError;
    }
    assert.deepEqual(complaints, []);
    assert.equal(html, "");
  });
});

describe("a primary that resolves false", () => {
  /**
   * A submit can SUCCEED and still have something left to say: minting an API
   * key reveals its secret exactly once, and a dialog that closed on success
   * would take the secret with it. Rejecting is the wrong signal for that —
   * a rejection is the failure posture (the input survives for a correction).
   * So `false` means "the work landed; the dialog has more to show".
   */
  it("keeps the dialog open, and still ends the pending state", async () => {
    const events: string[] = [];
    const inFlight = { current: false };
    const returned = runPendingAction(inFlight, () => Promise.resolve(false), {
      onPendingChange: (p) => events.push(`pending:${p}`),
      onResolved: () => events.push("closed"),
    });
    await returned;
    assert.deepEqual(events, ["pending:true", "pending:false"]);
    assert.equal(inFlight.current, false, "the second step must be clickable");
  });

  it("closes on any other resolution, undefined included", async () => {
    for (const value of [undefined, true, null, 0, ""]) {
      const events: string[] = [];
      await runPendingAction(inFlightRef(), () => Promise.resolve(value), {
        onPendingChange: () => undefined,
        onResolved: () => events.push("closed"),
      });
      assert.deepEqual(events, ["closed"], `resolved ${String(value)}`);
    }
  });

  it("works synchronously too, for a validation that never awaits", () => {
    const events: string[] = [];
    runPendingAction(inFlightRef(), () => false, {
      onPendingChange: (p) => events.push(`pending:${p}`),
      onResolved: () => events.push("closed"),
    });
    assert.deepEqual(events, [], "no promise, no spinner, and no close");
  });
});

function inFlightRef() {
  return { current: false };
}

describe("dismissing a form dialog", () => {
  it("is refused while the primary's promise is in flight", () => {
    // Escape, the overlay and the X all arrive as one `onOpenChange(false)`.
    // A half-saved form must not vanish under the user.
    assert.equal(refusesDismiss({ current: true }, false), true);
  });

  it("never blocks the dialog OPENING, in flight or not", () => {
    assert.equal(refusesDismiss({ current: true }, true), false);
    assert.equal(refusesDismiss({ current: false }, true), false);
  });

  it("lets an idle dialog close", () => {
    assert.equal(refusesDismiss({ current: false }, false), false);
  });
});

describe("a dialog with no second button", () => {
  it("resolves to null when the caller passes null", () => {
    // The reveal posture: the secret is already minted, so "Cancel" would be a
    // lie — there is one way out and it is the primary.
    assert.equal(
      resolveSecondary(null, "Cancel", () => undefined),
      null,
    );
  });

  it("renders the primary alone, still as the form's submit", () => {
    const html = renderToStaticMarkup(
      createElement(FormDialogForm, {
        primary: { label: "Done" },
        secondary: null,
        pending: false,
        onSubmit: () => undefined,
        children: null,
      }),
    );
    assert.equal(html.match(/<button/g)?.length, 1);
    assert.match(html, /type="submit"/);
    assert.match(html, /Done/);
  });
});
