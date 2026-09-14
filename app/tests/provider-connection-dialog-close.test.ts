import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { closeMeansCancel } from "../src/lib/provider-connect-dialog-close.ts";

/**
 * The chat's provider-connect step arms a connection observer and resumes the
 * agent when fresh auth evidence lands; a dialog close that reads as a cancel
 * tears that observer down. PRODUCT review (Sep 2026): picking a Copilot plan
 * closed the plan dialog as if the user had walked away, so the sign-in that
 * the pick had just STARTED was never observed and the agent never resumed.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src/components");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("closeMeansCancel", () => {
  it("does not cancel when an api key was saved", () => {
    strictEqual(closeMeansCancel("apiKey", "completed"), false);
  });

  it("does not cancel when a local model was connected", () => {
    strictEqual(closeMeansCancel("localModel", "completed"), false);
  });

  it("does not cancel when a Copilot plan was picked", () => {
    strictEqual(closeMeansCancel("copilot", "completed"), false);
  });

  it("cancels when the login dialog is dismissed", () => {
    strictEqual(closeMeansCancel("login", "dismissed"), true);
  });

  it("cancels every dialog the user simply walks away from", () => {
    for (const kind of ["apiKey", "copilot", "localModel", "login"] as const) {
      strictEqual(
        closeMeansCancel(kind, "dismissed"),
        true,
        `${kind} dismissal must cancel`,
      );
    }
  });

  it("cancels a login close even when reported as completed", () => {
    // The login dialog has no completion of its own — its flow finishes out of
    // band and the parent unmounts it — so a "completed" close there would be a
    // wiring mistake; it must still stop the observation rather than leave it
    // running against a sign-in nobody started.
    strictEqual(closeMeansCancel("login", "completed"), true);
  });
});

describe("the connect dialogs route their closes through closeMeansCancel", () => {
  it("wires the api-key, local-model and login dialogs to the shared table", () => {
    const src = read("provider-browser/provider-connection-dialogs.tsx");
    ok(src.includes("closeMeansCancel"), "dialog stack must use the helper");
    ok(
      !/apiKeySaved|localConnected/.test(src),
      "the ad-hoc success refs must be gone",
    );
  });

  it("wires the Copilot plan dialog to the shared table", () => {
    const src = read("shell/use-copilot-connect.tsx");
    ok(
      /closeMeansCancel\(\s*"copilot"/.test(src),
      "copilot host must decide through the shared table",
    );
    const connect = src.slice(src.indexOf("onConnect={"));
    ok(
      connect.slice(0, connect.indexOf("}}")).includes('"completed"'),
      "picking a plan must be reported as a completed close",
    );
  });

  it("never lets the Copilot dialog report its own submit as a close", () => {
    // The submit hands the plan back through `onConnect`, which is what CLOSES
    // the dialog. Calling `onClose` too reported a dismissal on the success
    // path — the cancel that killed the observation mid sign-in.
    const src = read("shell/provider-copilot-connect-dialog.tsx");
    const submit = src.slice(src.indexOf("const handleSubmit"));
    const body = submit.slice(0, submit.indexOf("\n  };"));
    ok(body.includes("onConnect("), "submit must hand the plan back");
    ok(!body.includes("onClose("), "submit must not also close the dialog");
  });
});
