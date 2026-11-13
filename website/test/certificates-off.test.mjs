// With no CERTS_EXPORT_TOKEN the certificate section is off: the deploy runs
// that way so it never spends ~27 min rendering certificate images. Off has to
// mean gone, not half there: no claim page with an empty event list, no sitemap
// entry and no 404 that sends people to a verifier the build left out.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "houston-site-nocerts-"));

after(() => rmSync(out, { recursive: true, force: true }));

before(() => {
  const { CERTS_EXPORT_TOKEN: _token, ...env } = process.env;
  execFileSync(
    join(root, "node_modules/.bin/eleventy"),
    [`--output=${out}`, "--quiet"],
    { cwd: root, env, stdio: "ignore" },
  );
});

test("without the export token no certificate page or image is built", () => {
  assert.equal(existsSync(join(out, "certificates")), false);
  assert.equal(existsSync(join(out, "c")), false);
  assert.ok(existsSync(join(out, "index.html")), "the rest of the site ships");
});

test("without the export token nothing links to the certificate pages", () => {
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /\/certificates\//);
  const notFound = readFileSync(join(out, "404.html"), "utf8");
  assert.doesNotMatch(notFound, /\/certificates\//);
  assert.match(notFound, /We could not find that page\./);
});
