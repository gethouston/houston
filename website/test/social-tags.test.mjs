// Link previews (Slack, WhatsApp, LinkedIn, X, iMessage) and search read a
// page's head tags, and a missing or stale one fails silently: the preview
// just shows less, or an old card. These tests build the site and read every
// page the way a crawler does.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const site = "https://gethouston.ai";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "houston-site-"));

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });

const headOf = (file) => readFileSync(file, "utf8").split("</head>")[0];
const all = (head, re) => [...head.matchAll(re)].map((m) => m[1]);
const meta = (head, key) =>
  all(
    head,
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, "g"),
  );
const one = (head, key) => {
  const values = meta(head, key);
  assert.equal(values.length, 1, `${key} appears ${values.length} times`);
  return values[0];
};
const canonicalOf = (head) =>
  all(head, /<link rel="canonical" href="([^"]*)"/g);
const hreflangsOf = (head) =>
  Object.fromEntries(
    [
      ...head.matchAll(
        /<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g,
      ),
    ].map((m) => [m[1], m[2]]),
  );
const fileFor = (url) => {
  const path = new URL(url).pathname;
  return join(out, path.endsWith("/") ? `${path}index.html` : path);
};

const jpegSize = (bytes) => {
  for (let i = 2; i < bytes.length; ) {
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error("no JPEG frame header");
};

after(() => rmSync(out, { recursive: true, force: true }));

let pages = [];
before(() => {
  execFileSync(
    join(root, "node_modules/.bin/eleventy"),
    [`--output=${out}`, "--quiet"],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  pages = htmlFiles(out)
    .filter((file) => !relative(out, file).startsWith("c/"))
    .map((file) => ({ path: `/${relative(out, file)}`, head: headOf(file) }))
    .filter(
      ({ head }) => head.includes("<html") && !head.includes('name="robots"'),
    );
});

test("every indexable page has a complete, absolute share card", () => {
  assert.ok(pages.length > 20, `only ${pages.length} indexable pages found`);
  for (const { path, head } of pages) {
    const where = `${path}: `;
    const canonical = canonicalOf(head);
    assert.equal(canonical.length, 1, `${where}one canonical`);
    assert.ok(
      canonical[0].startsWith(`${site}/`),
      `${where}absolute canonical`,
    );
    assert.equal(
      one(head, "og:url"),
      canonical[0],
      `${where}og:url is the canonical`,
    );
    const title = all(head, /<title>([^<]*)<\/title>/g);
    assert.equal(title.length, 1, `${where}one <title>`);
    assert.ok(title[0].trim(), `${where}<title> is empty`);
    for (const key of [
      "og:title",
      "og:description",
      "description",
      "og:image:alt",
    ]) {
      assert.ok(one(head, key).trim(), `${where}${key} is empty`);
    }
    assert.match(one(head, "og:type"), /^(website|article)$/, where);
    assert.equal(one(head, "og:site_name"), "Houston", where);
    assert.equal(one(head, "twitter:card"), "summary_large_image", where);
    assert.equal(one(head, "og:image:width"), "1200", where);
    assert.equal(one(head, "og:image:height"), "630", where);
    assert.match(
      one(head, "og:image"),
      /^https:\/\/gethouston\.ai\/og\/[\w-]+\.jpg\?v=\w+$/,
      where,
    );
  }
});

test("og:locale follows the page language", () => {
  const ogLocale = { en: "en_US", es: "es_LA", "pt-BR": "pt_BR" };
  for (const { path, head } of pages) {
    const lang = head.match(/<html lang="([^"]*)"/)[1];
    assert.equal(one(head, "og:locale"), ogLocale[lang], path);
  }
});

test("every card is a 1200x630 JPEG and its URL changes with its bytes", () => {
  const cards = new Set(pages.map(({ head }) => one(head, "og:image")));
  assert.ok(
    cards.size >= 6,
    `expected a card per language for home and enterprise, got ${cards.size}`,
  );
  for (const url of cards) {
    const bytes = readFileSync(join(out, new URL(url).pathname));
    assert.deepEqual(jpegSize(bytes), { width: 1200, height: 630 }, url);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    assert.equal(
      new URL(url).searchParams.get("v"),
      hash,
      `${url} is not the hash of the file`,
    );
  }
});

test("translated pages link every language both ways", () => {
  for (const { path, head } of pages) {
    const set = hreflangsOf(head);
    if (Object.keys(set).length === 0) continue;
    assert.ok(set["x-default"], `${path}: x-default`);
    assert.ok(
      Object.values(set).includes(canonicalOf(head)[0]),
      `${path}: lists itself`,
    );
    for (const url of Object.values(set)) {
      assert.deepEqual(
        hreflangsOf(headOf(fileFor(url))),
        set,
        `${path} -> ${url}`,
      );
    }
  }
});

test("the sitemap lists only built, indexable pages", () => {
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  const locs = all(sitemap, /<loc>([^<]*)<\/loc>/g);
  assert.ok(locs.length > 20);
  const indexable = new Set(pages.map(({ head }) => canonicalOf(head)[0]));
  for (const loc of locs)
    assert.ok(indexable.has(loc), `${loc} is missing or noindex`);
});

// The sitemap lists each translation group by hand, apart from the page
// front matter, so a page that loses its hreflang links fails here.
test("each page carries the language links its sitemap entry lists", () => {
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
    (m) => m[1],
  );
  const groups = entries.filter((entry) => entry.includes("hreflang"));
  assert.ok(groups.length >= 14, `only ${groups.length} translated entries`);
  for (const entry of groups) {
    const loc = entry.match(/<loc>([^<]*)<\/loc>/)[1];
    const listed = Object.fromEntries(
      [...entry.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    assert.deepEqual(hreflangsOf(headOf(fileFor(loc))), listed, loc);
  }
});
