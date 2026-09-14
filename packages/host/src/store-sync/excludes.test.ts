import { excluded } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { STORE_SYNC_EXCLUDES } from "./daemon-policy";

const AGENT = "workspaces/Personal/Marketing Manager";

// PRODUCT-1784: toolchains and browser caches an agent installs inside its
// workspace are rebuildable from its setup script and never ride the store.
test("toolchains and caches inside a workspace never sync", () => {
  for (const rel of [
    `${AGENT}/render/node_modules/remotion/package.json`,
    `${AGENT}/render/.venv/lib/python3.12/site-packages/x.py`,
    `${AGENT}/tools/venv/bin/activate`,
    `${AGENT}/scripts/__pycache__/main.cpython-312.pyc`,
    `${AGENT}/.cache/puppeteer/chrome/linux-1234/chrome`,
    `${AGENT}/.cache/ms-playwright/chromium-1/chrome-linux/chrome`,
    `${AGENT}/ms-playwright/chromium-1/chrome-linux/chrome`,
    `${AGENT}/profile/Default/Cache/data_0`,
    `${AGENT}/profile/Default/Code Cache/js/index`,
    `${AGENT}/profile/Default/GPUCache/index`,
  ]) {
    expect(excluded(rel, STORE_SYNC_EXCLUDES), rel).toBe(true);
  }
});

test("deliverables, sources and the setup script still sync", () => {
  for (const rel of [
    `${AGENT}/render/setup.sh`,
    `${AGENT}/render/package.json`,
    `${AGENT}/render/out/final.mp4`,
    `${AGENT}/render/src/Video.tsx`,
    `${AGENT}/requirements.txt`,
    `${AGENT}/.houston/routines/routines.json`,
    `${AGENT}/CLAUDE.md`,
    `${AGENT}/notes/cache-policy.md`,
  ]) {
    expect(excluded(rel, STORE_SYNC_EXCLUDES), rel).toBe(false);
  }
});
