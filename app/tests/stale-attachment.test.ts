import { equal, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isStaleAttachmentError } from "../src/lib/stale-attachment.ts";

// A composer attachment whose backing file changed on disk between attach and
// send fails the upload with a DOMException the browser mints when it
// re-validates the lazy `File` handle (HOUSTON-APP-4YX, all Windows
// WebView2). That state is the user's disk, not a Houston bug: it must
// classify as expected so the send catch shows authored remedy copy instead of
// the raw "NotFoundError: A requested file or directory could not be found…".

describe("isStaleAttachmentError", () => {
  it("matches the stale-File DOMExceptions", () => {
    equal(
      isStaleAttachmentError(
        new DOMException(
          "A requested file or directory could not be found at the time an operation was processed.",
          "NotFoundError",
        ),
      ),
      true,
    );
    equal(
      isStaleAttachmentError(
        new DOMException("The file could not be read.", "NotReadableError"),
      ),
      true,
    );
  });

  it("rejects everything else, DOMException or not", () => {
    // AbortError is a cancelled request, NOT a stale file — it must keep its
    // own surfacing policy (see engine-call-policy).
    equal(
      isStaleAttachmentError(new DOMException("aborted", "AbortError")),
      false,
    );
    // A plain Error whose name merely collides must not match: only the
    // browser's File machinery throws the DOMException shape.
    const impostor = new Error("not found");
    impostor.name = "NotFoundError";
    equal(isStaleAttachmentError(impostor), false);
    equal(isStaleAttachmentError("NotFoundError"), false);
    equal(isStaleAttachmentError(undefined), false);
  });
});

// `send-error-toast` pulls i18n and the Zustand store, which don't load under
// this suite's strip-types runner — so the routing invariant is asserted
// structurally, same pattern as error-toast-not-shown.test.ts.
describe("showSendFailedToast routes the stale state to authored copy", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/send-error-toast.ts"),
    "utf8",
  );

  it("branches on isStaleAttachmentError before the generic red toast", () => {
    const stale = source.indexOf("isStaleAttachmentError(err)");
    const generic = source.indexOf("errors.sessionStart");
    ok(stale !== -1, "stale-attachment branch missing");
    ok(generic !== -1, "generic sessionStart fallback missing");
    ok(stale < generic, "stale branch must run before the generic toast");
  });

  it("shows the stale state as an expected-state toast, never raw err text", () => {
    const staleBranch = source.slice(
      source.indexOf("isStaleAttachmentError(err)"),
      source.indexOf("errors.sessionStart"),
    );
    ok(staleBranch.includes("showExpectedStateToast"));
    ok(staleBranch.includes("staleAttachmentTitle"));
    ok(staleBranch.includes("staleAttachmentBody"));
    ok(
      !staleBranch.includes("String(err)"),
      "stale copy must be authored, not the raw DOMException",
    );
  });
});
