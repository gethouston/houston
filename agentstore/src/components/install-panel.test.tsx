// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPanel } from "./install-panel";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const props = {
  agentName: "Cool Agent",
  slug: "cool-agent",
  instructions: "do the thing",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

function clickOpenInHouston() {
  const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Try it now"),
  );
  if (!trigger) throw new Error("Try it now trigger not found");
  act(() => {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const item = Array.from(document.querySelectorAll("[role=menuitem]")).find(
    (element) => element.textContent?.includes("Open in Houston"),
  );
  if (!item) throw new Error("Open in Houston menu item not found");
  act(() => {
    item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    item.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("OpenInHouston focus-listener hygiene", () => {
  it("removes its blur/visibilitychange listeners when unmounted before the fallback timer fires", () => {
    const removeWin = vi.spyOn(window, "removeEventListener");
    const removeDoc = vi.spyOn(document, "removeEventListener");

    act(() => root.render(<InstallPanel {...props} />));
    clickOpenInHouston();

    // Unmount before the fallback timer fires and before any blur/visibilitychange.
    act(() => root.unmount());

    expect(removeWin).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(removeDoc).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });

  it("removes the prior click's listeners when clicked again before the timer fires", () => {
    const removeWin = vi.spyOn(window, "removeEventListener");
    const removeDoc = vi.spyOn(document, "removeEventListener");

    act(() => root.render(<InstallPanel {...props} />));
    clickOpenInHouston();
    clickOpenInHouston();

    expect(removeWin).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(removeDoc).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );

    act(() => root.unmount());
  });
});
