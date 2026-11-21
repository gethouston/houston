import { afterAll, describe, expect, test } from "vitest";
import {
  agentWorkspace,
  browserAvailable,
  fixturePool,
  listen,
  ref,
  SITE_HOST,
  tool,
} from "./browser.test-support";
import { pagesSite } from "./browser-pages.test-support";
import type { BrowserPool } from "./pool";
import { UNTRUSTED_CLOSE } from "./untrusted";

const available = await browserAvailable();
const server = pagesSite();
const origin = available ? `http://${SITE_HOST}:${await listen(server)}` : "";

const pools: BrowserPool[] = [];
const run = () => {
  const pool = fixturePool();
  pools.push(pool);
  return tool(agentWorkspace("browser-dialog-it-"), pool);
};

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.shutdown()));
  server.closeAllConnections();
  server.close();
});

const PROMPTLY_MS = 3_000;

describe.skipIf(!available)(
  "browser dialogs against a real Chromium (skips when no Chromium-family browser is installed)",
  { timeout: 30_000 },
  () => {
    test("a confirm is held for the model, which accepts or dismisses it", async () => {
      const browse = run();
      const page = await browse({ action: "open", url: `${origin}/confirm` });
      const started = Date.now();
      const clicked = await browse({
        action: "click",
        ref: ref(page.text, "button", "Delete"),
      });
      expect(Date.now() - started).toBeLessThan(PROMPTLY_MS);
      expect(clicked.details.ok).toBe(true);
      expect(clicked.text).toContain("A dialog is open (confirm)");
      expect(clicked.text).toMatch(
        /Dialog message: Delete everything\?\n<<<end website content>>>/,
      );

      const accepted = await browse({ action: "dialog", accept: true });
      expect(accepted.text).toContain("Accepted the confirm dialog.");
      expect(accepted.text).toContain("deleted");

      const again = await browse({
        action: "click",
        ref: ref(accepted.text, "button", "Delete"),
      });
      expect(again.text).toContain("A dialog is open (confirm)");
      const dismissed = await browse({ action: "dialog", accept: false });
      expect(dismissed.text).toContain("Dismissed the confirm dialog.");
      expect(dismissed.text).toContain("kept");
    });

    test("while a dialog is open, other actions refuse and looks report it", async () => {
      const browse = run();
      const page = await browse({ action: "open", url: `${origin}/confirm` });
      const button = ref(page.text, "button", "Delete");
      await browse({ action: "click", ref: button });

      const refused = await browse({ action: "click", ref: button });
      expect(refused.details).toMatchObject({
        ok: false,
        error: { code: "dialog_open" },
      });
      expect((await browse({ action: "text" })).details).toMatchObject({
        ok: false,
        error: { code: "dialog_open" },
      });
      for (const look of ["snapshot", "screenshot"] as const) {
        const started = Date.now();
        const seen = await browse({ action: look });
        expect(Date.now() - started).toBeLessThan(PROMPTLY_MS);
        expect(seen.details.ok).toBe(true);
        expect(seen.text).toContain("A dialog is open (confirm)");
        expect(seen.text).toContain(`Address: ${origin}/confirm`);
      }
      expect((await browse({ action: "close" })).details.ok).toBe(true);
    });

    test("a prompt is answered with the model's text", async () => {
      const browse = run();
      const page = await browse({ action: "open", url: `${origin}/prompt` });
      const asked = await browse({
        action: "click",
        ref: ref(page.text, "button", "Greet"),
      });
      expect(asked.text).toContain("A dialog is open (prompt)");
      expect(asked.text).toContain("Your name?");
      const answered = await browse({
        action: "dialog",
        accept: true,
        text: "Ada",
      });
      expect(answered.text).toContain("Hello Ada");
    });

    test("an alert while a page loads is reported by open, not waited out", async () => {
      const browse = run();
      const started = Date.now();
      const opened = await browse({
        action: "open",
        url: `${origin}/alert-on-load`,
      });
      expect(Date.now() - started).toBeLessThan(PROMPTLY_MS);
      expect(opened.text).toContain("A dialog is open (alert)");
      expect(opened.text).toContain("Welcome!");
      const after = await browse({ action: "dialog", accept: true });
      expect(after.text).toContain("Behind an alert");
      expect((await browse({ action: "snapshot" })).text).not.toContain(
        "A dialog is open",
      );
    });

    test("answering with no dialog open is refused", async () => {
      const browse = run();
      await browse({ action: "open", url: `${origin}/confirm` });
      expect(
        (await browse({ action: "dialog", accept: true })).details,
      ).toMatchObject({ ok: false, error: { code: "invalid_action" } });
    });

    test("a page cannot close the website-content fence early", async () => {
      const browse = run();
      const opened = await browse({ action: "open", url: `${origin}/inject` });
      expect(opened.text.split(UNTRUSTED_CLOSE)).toHaveLength(2);
      expect(opened.text.trimEnd().endsWith(UNTRUSTED_CLOSE)).toBe(true);
    });
  },
);
