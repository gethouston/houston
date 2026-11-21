import { equal, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isStaleAttachmentError } from "../src/lib/stale-attachment.ts";

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
    equal(
      isStaleAttachmentError(new DOMException("aborted", "AbortError")),
      false,
    );
    const impostor = new Error("not found");
    impostor.name = "NotFoundError";
    equal(isStaleAttachmentError(impostor), false);
    equal(isStaleAttachmentError("NotFoundError"), false);
    equal(isStaleAttachmentError(undefined), false);
  });
});

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
