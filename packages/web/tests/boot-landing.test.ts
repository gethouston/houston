import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  captureBootLanding,
  peekBootLanding,
} from "@houston/app/lib/settings-landing";
import { expect, test } from "vitest";

const TICKET = "Tk7-ticket.value_~9";

/**
 * The web entry strips a landing's one-time ticket before the app graph (and
 * with it the analytics and Sentry bootstraps) loads: `session_started`
 * carries PostHog's `$current_url`, and Sentry records URL changes.
 */
test("the web entry captures the landing before anything loads the app", () => {
  const main = readFileSync(resolve(__dirname, "../src/main.tsx"), "utf8");
  const capture = main.indexOf("captureBootLanding(window.location.href");
  expect(capture).toBeGreaterThan(-1);
  // Every root (and so the app tree with its analytics) loads dynamically,
  // after the capture.
  const firstLoad = main.indexOf('import("./');
  expect(firstLoad).toBeGreaterThan(capture);
  // No static import pulls the analytics or Sentry bootstraps in earlier.
  const statics = main.match(/^import .*$/gm) ?? [];
  for (const line of statics)
    expect(line).not.toMatch(/analytics|sentry|app-tree|cloud-login/);
});

test("the URL is clean when the app starts, and the ticket waits in memory", () => {
  let url = `https://app.gethouston.ai/?settings=linkedin&linkedin=${TICKET}`;
  captureBootLanding(url, (clean) => {
    url = new URL(clean, url).href;
  });
  expect(url).toBe("https://app.gethouston.ai/");
  expect(url).not.toContain(TICKET);
  expect(peekBootLanding(url, () => {})).toEqual({
    kind: "linkedin",
    completion: { kind: "ticket", ticket: TICKET },
  });
});
