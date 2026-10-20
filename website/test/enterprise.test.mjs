// The /enterprise page zips structure (_data/enterprise.js) with copy
// (_data/i18n/enterprise/<lang>.js) by index, and points at image files by
// name. Nothing at build time notices when the two drift: Nunjucks renders an
// undefined lookup as an empty string and a missing image as a broken tile.
// These tests are that notice.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import computed from "../src/_data/eleventyComputed.js";
import enterprise from "../src/_data/enterprise.js";
import en from "../src/_data/i18n/en.js";
import enterpriseEn from "../src/_data/i18n/enterprise/en.js";
import enterpriseEs from "../src/_data/i18n/enterprise/es.js";
import enterprisePt from "../src/_data/i18n/enterprise/pt.js";
import es from "../src/_data/i18n/es.js";
import pt from "../src/_data/i18n/pt.js";
import landing from "../src/_data/landing.js";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const locales = { en, es, pt };
const i18n = {
  en,
  es,
  pt,
  enterprise: { en: enterpriseEn, es: enterpriseEs, pt: enterprisePt },
};
// Exactly what a page gets as `t`, through the real computed-data function.
const treeFor = (lang) =>
  computed.t({ lang, i18n, locales: { en: {}, es: {}, pt: {} } });

for (const code of Object.keys(locales)) {
  const tree = treeFor(code);
  const copy = tree.enterprise;

  test(`${code}: every structure array has its copy`, () => {
    const pairs = [
      ["industries", enterprise.industries, copy.hero.industries],
      ["hero lines", [0, 1], copy.hero.h1Lines],
      ["problems", enterprise.problems, copy.problem.cards],
    ];
    for (const [name, structure, text] of pairs) {
      assert.equal(text.length, structure.length, name);
    }
    for (const card of copy.problem.cards) {
      assert.ok(card.title && card.alt, card.title);
    }
  });

  test(`${code}: the settled number is the one the count-up lands on`, () => {
    const digits = copy.trust.value.replace(/\D/g, "");
    assert.equal(Number(digits), enterprise.agents);
  });

  test(`${code}: every phase has its title and line`, () => {
    const { phases } = copy.solution;
    assert.equal(phases.length, 4);
    for (const phase of phases) {
      assert.ok(phase.head && phase.rest, phase.head);
    }
  });

  test(`${code}: the contact people have a name to show`, () => {
    for (const id of enterprise.contact.people) {
      assert.ok(tree.js.people[id], id);
    }
  });
}

test("every industry and problem photo exists", () => {
  const files = [
    ...enterprise.industries.map(({ id }) => `industries/${id}.webp`),
    ...enterprise.problems.map((id) => `problem/${id}.webp`),
  ];
  for (const file of files) {
    const path = `assets/img/enterprise/${file}`;
    assert.ok(existsSync(resolve(src, path)), path);
  }
});

test("every reel clip has its video and poster, once", () => {
  assert.equal(new Set(enterprise.reel).size, enterprise.reel.length);
  for (const clip of enterprise.reel) {
    for (const ext of ["mp4", "webp"]) {
      const file = `${enterprise.reelDir.slice(1)}/${clip}.${ext}`;
      assert.ok(existsSync(resolve(src, file)), file);
    }
  }
});

test("every logo exists, once", () => {
  const files = enterprise.logos.map((logo) => logo.file);
  assert.equal(new Set(files).size, files.length);
  for (const file of files) {
    // The source artwork, and the light set the black band shows
    // (scripts/make-light-logos.sh builds the second from the first).
    for (const dir of ["logos", "logos-light"]) {
      const path = `assets/img/enterprise/${dir}/${file}.png`;
      assert.ok(existsSync(resolve(src, path)), path);
    }
  }
});

test("every booking CTA points at the calendar, not an email or a phone", () => {
  assert.match(enterprise.contact.booking, /^https:\/\/calendly\.com\//);
  assert.equal(enterprise.contact.email, undefined);
  assert.equal(enterprise.contact.phones, undefined);
});

test("marks and faces resolve through the landing's sources", () => {
  for (const id of enterprise.contact.people) {
    assert.ok(landing.people[id]?.img, id);
  }
});

test("the page is built at the path the nav and footer link to", () => {
  for (const dir of ["", "es/", "pt/"]) {
    const stub = `${dir}${enterprise.path}index.njk`;
    assert.ok(existsSync(resolve(src, stub)), stub);
  }
});
