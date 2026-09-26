import assert from "node:assert/strict";
import { test } from "node:test";
import { openLinkOutside } from "../src/lib/external-link-click";

const URL = "https://checkout.stripe.test/s";

function click() {
  let prevented = false;
  return {
    event: {
      preventDefault: () => {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
}

test("desktop opens the link through the OS browser, not the webview", () => {
  const opened: string[] = [];
  const { event, prevented } = click();
  openLinkOutside(event, URL, {
    desktop: true,
    open: async (url) => {
      opened.push(url);
      return true;
    },
  });
  assert.equal(prevented(), true);
  assert.deepEqual(opened, [URL]);
});

test("web keeps the anchor's own new-tab open, inside the click", () => {
  const opened: string[] = [];
  const { event, prevented } = click();
  openLinkOutside(event, URL, {
    desktop: false,
    open: async (url) => {
      opened.push(url);
      return true;
    },
  });
  assert.equal(prevented(), false);
  assert.deepEqual(opened, []);
});
