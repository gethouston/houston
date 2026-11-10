// The /data-partners/refer page zips structure (_data/refer.js) with copy
// (_data/i18n/refer/<lang>.js) by index and fills the program's figure into
// the copy by placeholder. Nunjucks renders a missing lookup as an empty
// string, so nothing at build time notices drift. These tests are that
// notice, plus the form's rules (assets/refer-model.js).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import landing from "../src/_data/landing.js";
import refer from "../src/_data/refer.js";
import {
  MAX_COUNTRY_LENGTH,
  MAX_PHONE_DIGITS,
  MAX_PHONE_LENGTH,
  MAX_SIZE_LENGTH,
  MAX_YEARS,
  MIN_PHONE_DIGITS,
  siteHost,
  validate,
} from "../src/assets/refer-model.js";
import { treeFor } from "./support/locale-tree.mjs";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const strings = (node) =>
  typeof node === "string"
    ? [node]
    : Object.values(node ?? {}).flatMap((child) => strings(child));

for (const code of ["en", "es", "pt"]) {
  const tree = treeFor(code);
  const copy = tree.refer;

  test(`${code}: every structure array has its copy`, () => {
    const pairs = [
      ["categories", refer.categories, copy.companies.categories],
      ["steps", refer.steps, copy.how.steps],
      ["states", refer.states, copy.track.states],
    ];
    for (const [name, structure, text] of pairs) {
      assert.equal(text.length, structure.length, name);
    }
  });

  test(`${code}: the only placeholders are the ones the templates fill`, () => {
    const filled = new Set(["{amount}"]);
    for (const line of strings(copy)) {
      for (const hole of line.match(/\{[^}]*\}/g) ?? []) {
        assert.ok(filled.has(hole), `${hole} in "${line}"`);
      }
    }
  });

  // The figure is written once, in _data/refer.js; the copy states the
  // referral share in words, so hold it to that.
  test(`${code}: the copy states the program's terms`, () => {
    assert.equal(
      Number(refer.amountText[code].replace(/\D/g, "")),
      refer.amountUsd,
    );
    const percent = `${refer.headlineShare * 100}%`;
    assert.ok(copy.hero.card.terms[0].includes(percent));
    assert.ok(copy.terms.groups[0].lines[0].includes(percent));
    assert.ok(copy.faq.items[0].a.includes(percent));
    assert.ok(copy.faq.items[0].a.includes("{amount}"));
  });

  test(`${code}: the closing faces have a name to show`, () => {
    for (const id of refer.people) {
      assert.ok(tree.js.people[id], id);
      assert.ok(landing.people[id]?.img, id);
    }
  });
}

test("the page is built at the path its alternates point to", () => {
  for (const dir of ["", "es/", "pt/"]) {
    const stub = `${dir}${refer.path}index.njk`;
    assert.ok(existsSync(resolve(src, stub)), stub);
  }
});

const valid = {
  yourName: "Ana Ruiz",
  yourEmail: "ana@gmail.com",
  yourPhone: "+57 300 123 4567",
  companyName: "Acme",
  website: "https://www.Acme.com/about",
  size: "about 120",
  years: "12",
  industry: "finance",
  country: "Colombia",
};

test("a complete referral passes", () => {
  assert.deepEqual(validate(valid), {});
});

test("an empty form names every field the visitor fills, and not the request", () => {
  assert.deepEqual(Object.keys(validate({})).sort(), [
    "companyName",
    "country",
    "industry",
    "size",
    "website",
    "years",
    "yourEmail",
    "yourName",
    "yourPhone",
  ]);
});

test("a website is read as its bare host", () => {
  assert.equal(siteHost(" https://www.Acme.com/about?x=1 "), "acme.com");
  assert.equal(siteHost("shop.acme.co.uk"), "shop.acme.co.uk");
  assert.equal(siteHost("acme"), null);
  assert.equal(siteHost("not a site.com"), null);
});

test("referring your own company is refused on the website", () => {
  const own = { ...valid, yourEmail: "ana@acme.com" };
  assert.deepEqual(validate(own), { website: "sameCompany" });
  const sub = { ...valid, yourEmail: "ana@mail.acme.com" };
  assert.deepEqual(validate(sub), { website: "sameCompany" });
  const lookalike = { ...valid, yourEmail: "ana@notacme.com" };
  assert.deepEqual(validate(lookalike), {});
});

test("the company size is the referrer's own words, within reason", () => {
  for (const size of ["120", "200-500", "about 120 people"])
    assert.deepEqual(validate({ ...valid, size }), {}, size);
  for (const size of ["", "   ", "x".repeat(MAX_SIZE_LENGTH + 1)])
    assert.deepEqual(validate({ ...valid, size }), { size: "size" });
});

test("the country is required and stays a country name's length", () => {
  for (const country of ["", "   ", "x".repeat(MAX_COUNTRY_LENGTH + 1)])
    assert.deepEqual(validate({ ...valid, country }), { country: "country" });
});

test("years in business is a whole number of years", () => {
  for (const years of ["0", "12", " 45 ", String(MAX_YEARS)])
    assert.deepEqual(validate({ ...valid, years }), {}, years);
  for (const years of ["", "12.5", "about 12", "-3", String(MAX_YEARS + 1)])
    assert.deepEqual(validate({ ...valid, years }), { years: "years" }, years);
});

test("your phone is a dialled number, country code and separators allowed", () => {
  const digits = (n) => "9".repeat(n);
  for (const yourPhone of [
    "+1 (555) 123-4567",
    "+55 11 91234.5678",
    "3001234567",
    digits(MIN_PHONE_DIGITS),
    `+${digits(MAX_PHONE_DIGITS)}`,
  ])
    assert.deepEqual(validate({ ...valid, yourPhone }), {}, yourPhone);
  for (const yourPhone of [
    "",
    "   ",
    "call me",
    "+57 300 123 4567 ext 2",
    digits(MIN_PHONE_DIGITS - 1),
    digits(MAX_PHONE_DIGITS + 1),
    `+57 ${" ".repeat(MAX_PHONE_LENGTH)}300 123 4567`,
  ])
    assert.deepEqual(
      validate({ ...valid, yourPhone }),
      { yourPhone: "yourPhone" },
      yourPhone,
    );
});
