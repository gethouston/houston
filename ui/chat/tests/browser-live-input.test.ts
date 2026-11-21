import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type BrowserLiveStageGeometry,
  normalizedPoint,
  wheelInput,
} from "../src/browser-live-geometry.ts";
import {
  beforeInputKey,
  isLeavePageKey,
  keyDownInput,
  textInput,
} from "../src/browser-live-keys.ts";
import {
  type BrowserLivePointerSample,
  createBrowserLivePointer,
} from "../src/browser-live-pointer.ts";

const GEO: BrowserLiveStageGeometry = {
  left: 100,
  top: 100,
  width: 640,
  height: 400,
  frameWidth: 1280,
};

const mouse = (
  clientX: number,
  clientY: number,
  extra: Partial<BrowserLivePointerSample> = {},
): BrowserLivePointerSample => ({
  pointerType: "mouse",
  button: 0,
  buttons: 1,
  clientX,
  clientY,
  ...extra,
});
const finger = (clientX: number, clientY: number) =>
  mouse(clientX, clientY, { pointerType: "touch" });

const key = (k: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key: k,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("live view pointer", () => {
  it("normalizes to the painted frame and clamps outside it", () => {
    deepStrictEqual(normalizedPoint(420, 300, GEO), { x: 0.5, y: 0.5 });
    deepStrictEqual(normalizedPoint(0, 900, GEO), { x: 0, y: 1 });
    deepStrictEqual(normalizedPoint(5, 5, { ...GEO, width: 0 }), {
      x: 0,
      y: 0,
    });
  });

  it("counts double and triple clicks within 500 ms and 5 px", () => {
    const p = createBrowserLivePointer();
    const counts = [0, 200, 400, 1500].map((at) => {
      const [down] = p.down(mouse(420, 300), GEO, at);
      return down?.type === "mouse" ? down.clickCount : null;
    });
    deepStrictEqual(counts, [1, 2, 3, 1]);
    const [far] = p.down(mouse(440, 300), GEO, 1600);
    strictEqual(far?.type === "mouse" && far.clickCount, 1);
    const up = p.up(mouse(440, 300), GEO);
    deepStrictEqual(up.events, [
      { type: "mouse", action: "up", clickCount: 1, x: 0.53125, y: 0.5 },
    ]);
    strictEqual(up.focusKeyboard, true);
  });

  it("forwards only the primary button", () => {
    const p = createBrowserLivePointer();
    deepStrictEqual(p.down(mouse(420, 300, { button: 2 }), GEO, 0), []);
    deepStrictEqual(p.up(mouse(420, 300, { button: 2 }), GEO).events, []);
  });

  it("throttles moves to one per 33 ms and carries the held button", () => {
    const p = createBrowserLivePointer();
    strictEqual(p.move(mouse(420, 300), GEO, 0).length, 1);
    strictEqual(p.move(mouse(421, 300), GEO, 20).length, 0);
    deepStrictEqual(p.move(mouse(422, 300, { buttons: 3 }), GEO, 40), [
      { type: "mouse", action: "move", buttons: 1, x: 0.503125, y: 0.5 },
    ]);
  });

  it("turns a short touch into a click that raises the keyboard", () => {
    const p = createBrowserLivePointer();
    deepStrictEqual(p.down(finger(420, 300), GEO, 0), []);
    deepStrictEqual(p.move(finger(424, 303), GEO, 10), []);
    const up = p.up(finger(424, 303), GEO);
    strictEqual(up.focusKeyboard, true);
    strictEqual(up.events[0]?.type === "mouse" && up.events[0].action, "click");
  });

  it("turns a touch drag into a page-pixel scroll that keeps the keyboard down", () => {
    const p = createBrowserLivePointer();
    p.down(finger(420, 300), GEO, 0);
    const [scroll] = p.move(finger(420, 280), GEO, 10);
    strictEqual(scroll?.type === "wheel" && scroll.dy, 40);
    strictEqual(scroll?.type === "wheel" && scroll.dx, 0);
    const up = p.up(finger(420, 280), GEO);
    deepStrictEqual(up, { events: [], focusKeyboard: false });
  });

  it("normalizes wheel lines and pages to pixels", () => {
    const at = { clientX: 420, clientY: 300 };
    const px = wheelInput({ ...at, deltaX: 0, deltaY: 3, deltaMode: 0 }, GEO);
    const lines = wheelInput(
      { ...at, deltaX: 1, deltaY: 3, deltaMode: 1 },
      GEO,
    );
    const pages = wheelInput(
      { ...at, deltaX: 0, deltaY: 1, deltaMode: 2 },
      GEO,
    );
    strictEqual(px.type === "wheel" && px.dy, 3);
    strictEqual(lines.type === "wheel" && lines.dy, 48);
    strictEqual(lines.type === "wheel" && lines.dx, 16);
    strictEqual(pages.type === "wheel" && pages.dy, 800);
  });
});

describe("live view keys", () => {
  it("sends special keys by name with CDP modifier bits", () => {
    deepStrictEqual(keyDownInput(key("Enter")), { type: "key", key: "Enter" });
    deepStrictEqual(keyDownInput(key("Tab", { shiftKey: true })), {
      type: "key",
      key: "Tab",
      modifiers: 8,
    });
    deepStrictEqual(
      keyDownInput(
        key("ArrowLeft", { altKey: true, ctrlKey: true, metaKey: true }),
      ),
      { type: "key", key: "ArrowLeft", modifiers: 7 },
    );
  });

  it("leaves printable keys and composition to the text field", () => {
    strictEqual(keyDownInput(key("a")), null);
    strictEqual(keyDownInput(key("Enter", { isComposing: true })), null);
  });

  it("drops the Enter that commits an IME composition (keyCode 229)", () => {
    strictEqual(keyDownInput({ ...key("Enter"), keyCode: 229 }), null);
    deepStrictEqual(keyDownInput({ ...key("Enter"), keyCode: 13 }), {
      type: "key",
      key: "Enter",
    });
  });

  it("knows Shift+Escape alone as the way out of the page", () => {
    strictEqual(isLeavePageKey(key("Escape", { shiftKey: true })), true);
    strictEqual(isLeavePageKey(key("Escape")), false);
    strictEqual(
      isLeavePageKey(key("Escape", { shiftKey: true, ctrlKey: true })),
      false,
    );
    strictEqual(isLeavePageKey(key("Tab", { shiftKey: true })), false);
  });

  it("sends Backspace on an empty field, where phones fire no keydown", () => {
    deepStrictEqual(beforeInputKey("deleteContentBackward", ""), {
      type: "key",
      key: "Backspace",
    });
    strictEqual(beforeInputKey("deleteContentBackward", "x"), null);
    strictEqual(beforeInputKey("insertText", ""), null);
  });

  it("flushes the field as one text event", () => {
    deepStrictEqual(textInput("héllo 日本"), {
      type: "text",
      text: "héllo 日本",
    });
    strictEqual(textInput(""), null);
  });
});
