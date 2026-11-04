// The request board on /data-partners/refer and each request's own page.
// Structure (_data/referListings.js) and copy (_data/i18n/referListings,
// _data/i18n/referBoard) meet only by slug and by placeholder, and Nunjucks
// renders a miss as an empty string. These tests are the notice that the two
// drifted, plus the money each card and page shows.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import refer from "../src/_data/refer.js";
import referListings from "../src/_data/referListings.js";
import { referralRow } from "../src/assets/refer-model.js";
import { treeFor } from "./support/locale-tree.mjs";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const { items, categories } = referListings;
const digits = (text) => Number(text.replace(/\D/g, ""));
const strings = (node) =>
  typeof node === "string"
    ? [node]
    : Object.values(node ?? {}).flatMap((child) => strings(child));

test("every request has a unique slug and a known category", () => {
  assert.equal(new Set(items.map((item) => item.slug)).size, items.length);
  for (const item of items) {
    assert.match(item.slug, /^[a-z0-9-]+$/, item.slug);
    assert.ok(refer.categories.includes(item.category), item.slug);
    assert.equal(refer.categories[item.categoryIndex], item.category);
  }
});

test("a request earns its referral amount plus its bonuses", () => {
  for (const item of items) {
    const bonuses = item.bonuses.reduce((sum, b) => sum + b.amountUsd, 0);
    assert.equal(item.earnUsd, item.referralUsd + bonuses, item.slug);
    assert.ok(item.dealMinUsd <= item.dealMaxUsd, item.slug);
  }
});

test("the board leads with what a referral earns", () => {
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i - 1].earnUsd >= items[i].earnUsd, items[i].slug);
  }
});

test("the industry tabs are the categories that have a request", () => {
  const used = new Set(items.map((item) => item.category));
  assert.deepEqual(
    categories,
    refer.categories.filter((id) => used.has(id)),
  );
});

for (const code of ["en", "es", "pt"]) {
  const tree = treeFor(code);

  test(`${code}: every request has its copy, and nothing else does`, () => {
    const slugs = Object.keys(tree.referListings);
    assert.deepEqual(slugs.sort(), items.map((item) => item.slug).sort());
    for (const item of items) {
      const copy = tree.referListings[item.slug];
      // The card and the page header need these; every other field may be
      // empty, and the page drops its section and tab.
      for (const key of ["title", "summary", "about"]) {
        assert.ok(copy[key], `${item.slug}.${key}`);
      }
      for (const key of ["lookingFor", "notAFit", "covers", "questions"]) {
        assert.ok(Array.isArray(copy[key]), `${item.slug}.${key}`);
      }
    }
  });

  test(`${code}: every amount shown is the request's own number`, () => {
    for (const item of items) {
      const fmt = item.fmt[code];
      assert.equal(digits(fmt.earn), item.earnUsd, item.slug);
      assert.equal(digits(fmt.referral), item.referralUsd, item.slug);
      fmt.bonuses.forEach((text, i) => {
        assert.equal(digits(text), item.bonuses[i].amountUsd, item.slug);
      });
    }
  });

  test(`${code}: every bonus kind has a name`, () => {
    const kinds = tree.referBoard.listing.sidebar.bonusKinds;
    for (const item of items) {
      for (const bonus of item.bonuses)
        assert.ok(kinds[bonus.kind], bonus.kind);
    }
  });

  test(`${code}: the board's placeholders are the ones it fills`, () => {
    const filled = new Set([
      "{amount}",
      "{min}",
      "{max}",
      "{count}",
      "{title}",
    ]);
    for (const line of strings(tree.referBoard)) {
      for (const hole of line.match(/\{[^}]*\}/g) ?? []) {
        assert.ok(filled.has(hole), `${hole} in "${line}"`);
      }
    }
    for (const line of strings(tree.referListings)) {
      assert.doesNotMatch(line, /\{[^}]*\}/, line);
    }
  });
}

test("every request page is built in every language", () => {
  for (const dir of ["", "es/", "pt/"]) {
    const stub = resolve(src, `${dir}${refer.path}requests.njk`);
    assert.ok(existsSync(stub), stub);
    const permalink = `/${dir}${refer.path}{{ item.slug }}/index.html`;
    assert.ok(readFileSync(stub, "utf8").includes(permalink), stub);
  }
});

test("a referral from a request's page names the request", () => {
  const row = referralRow(
    {
      yourName: "Ana Ruiz",
      yourEmail: "ana@gmail.com",
      listing: "construction",
      companyName: "Turner Build",
      website: "turnerbuild.com",
      size: "about 200",
      years: "18",
      industry: "industrial",
    },
    { locale: "en", page: "/data-partners/refer/construction/" },
  );
  assert.equal(row.listing, "construction");
  assert.ok(referListings.items.some((item) => item.slug === row.listing));
});
