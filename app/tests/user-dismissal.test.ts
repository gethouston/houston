import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createUserDismissal } from "../src/components/shell/user-dismissal.ts";

// The plan prompts belong to the whole shell. The app's own synthetic Escape
// (sent when leaving a kept-alive screen with a modal open) is not cancelable,
// so Radix still asks to close; the gate must drop that request, or the launch
// announcement is dismissed for good without the user ever seeing it.

const noop = { preventDefault: () => {} };
const escapeKey = (isTrusted: boolean) => ({ ...noop, isTrusted });
const pointerDown = (isTrusted: boolean) => ({
  ...noop,
  detail: { originalEvent: { isTrusted } },
});
const nextMicrotask = () => new Promise<void>((done) => queueMicrotask(done));

function gate() {
  const dismissals: string[] = [];
  const dismissal = createUserDismissal();
  const request = (cause: string) =>
    dismissal.onOpenChange(() => dismissals.push(cause))(false);
  return { dismissal, dismissals, request };
}

describe("shell dialogs close on user intent only", () => {
  it("drops the close Radix sends after a synthetic Escape", async () => {
    const { dismissal, dismissals, request } = gate();
    dismissal.contentProps.onEscapeKeyDown(escapeKey(false));
    request("app Escape");
    await nextMicrotask();
    dismissal.contentProps.onEscapeKeyDown(escapeKey(true));
    request("user Escape");
    deepStrictEqual(dismissals, ["user Escape"]);
  });

  it("drops a scripted pointer-down outside, keeps a real one", async () => {
    const { dismissal, dismissals, request } = gate();
    dismissal.contentProps.onPointerDownOutside(pointerDown(false));
    request("scripted outside");
    await nextMicrotask();
    dismissal.contentProps.onPointerDownOutside(pointerDown(true));
    request("real outside");
    deepStrictEqual(dismissals, ["real outside"]);
  });

  it("a synthetic event never swallows the user's next close", async () => {
    const { dismissal, dismissals, request } = gate();
    dismissal.contentProps.onEscapeKeyDown(escapeKey(false));
    await nextMicrotask();
    request("the X");
    deepStrictEqual(dismissals, ["the X"]);
  });

  it("stops a cancelable synthetic event before Radix acts on it", () => {
    let prevented = 0;
    const { dismissal } = gate();
    const count = { preventDefault: () => (prevented += 1) };
    dismissal.contentProps.onEscapeKeyDown({ ...count, isTrusted: false });
    dismissal.contentProps.onEscapeKeyDown({ ...count, isTrusted: true });
    deepStrictEqual(prevented, 1);
  });
});
