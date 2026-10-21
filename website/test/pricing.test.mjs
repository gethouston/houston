// The published price and the copy around it (src/_data/pricing.js, the
// landing translations, and the partials that render them). Teams pay one
// monthly price per seat, with no annual plan and no free trial, so neither may
// come back through the data or a translation, and the free allowance is never
// given a number.
//
// The partials render through Nunjucks directly rather than a full Eleventy
// build, which would fetch GitHub releases for the changelog.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import enterprise from "../src/_data/enterprise.js";
import en from "../src/_data/i18n/en.js";
import es from "../src/_data/i18n/es.js";
import pt from "../src/_data/i18n/pt.js";
import locales from "../src/_data/locales.js";
import pricing from "../src/_data/pricing.js";

const translations = { en, es, pt };
const includes = fileURLToPath(new URL("../src/_includes", import.meta.url));
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(includes));

// Every string leaf of a tree, with its path.
const leaves = (value, path = "") => {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  }
  return Object.entries(value ?? {}).flatMap(([key, item]) =>
    leaves(item, path ? `${path}.${key}` : key),
  );
};

const render = (code, file) =>
  env.render(file, {
    t: translations[code],
    pricing: pricing(),
    locale: locales[code],
    localeRoot: locales[code].dir,
    enterprise,
  });

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the team plan is 15 per seat per month and nothing else", () => {
  const data = pricing();
  assert.equal(data.teamMonthly, 15);
  assert.equal(data.currencyCode, "USD");
  assert.equal("teamAnnual" in data, false);
  assert.equal("trialDays" in data, false);
  for (const code of locales.order) assert.ok(data.currency[code], code);
});

test("the landing page includes every pricing partial", async () => {
  const source = await readFile(`${includes}/landing.njk`, "utf8");
  for (const file of [
    "landing/pricing.njk",
    "landing/faq.njk",
    "landing/json-ld.njk",
  ]) {
    assert.ok(source.includes(`{% include "${file}" %}`), file);
  }
});

test("no template reads a retired price field", async () => {
  for (const file of [
    "landing/pricing.njk",
    "landing/faq.njk",
    "landing/json-ld.njk",
  ]) {
    const source = await readFile(`${includes}/${file}`, "utf8");
    assert.doesNotMatch(source, /teamAnnual|trialDays/, file);
  }
});

for (const code of locales.order) {
  const t = translations[code];
  const currency = pricing().currency[code];

  test(`${code}: no trial, annual price, personal space or free allowance size`, () => {
    for (const section of ["meta", "pricing", "faq", "footer"]) {
      for (const [path, line] of leaves(t[section], section)) {
        assert.doesNotMatch(line, /\{days\}/, path);
        assert.doesNotMatch(
          line,
          /trial|prueba|teste|annual|anual|por año|por ano/i,
          path,
        );
        assert.doesNotMatch(
          line,
          /personal space|espacio personal|espaço pessoal/i,
          path,
        );
        // The free pool size is the server's to set, never the site's.
        assert.doesNotMatch(line, /\d+\s*(messages|mensajes|mensagens)/i, path);
      }
    }
  });

  test(`${code}: {price} appears only in FAQ answers, which substitute it`, () => {
    const holders = leaves(t)
      .filter(([, line]) => line.includes("{price}"))
      .map(([path]) => path);
    assert.ok(holders.length > 0);
    for (const path of holders) {
      assert.match(path, /^faq\.groups\[\d+\]\.items\[\d+\]\.aHtml$/, path);
    }
  });

  test(`${code}: the pricing cards show the monthly seat price`, () => {
    const html = render(code, "landing/pricing.njk");
    assert.ok(html.includes(`class="amount">${currency}15<`), "team price");
    assert.ok(html.includes(`class="amount">${currency}0<`), "free price");
    assert.doesNotMatch(html, /\{(price|days)\}/);
    assert.ok(html.includes(t.pricing.team.cta));
  });

  test(`${code}: the FAQ renders the seat price`, () => {
    const html = render(code, "landing/faq.njk");
    assert.match(html, new RegExp(`[\\s>]${escapeRegExp(currency)}15 `));
    assert.doesNotMatch(html, /\{(price|days)\}/);
  });

  test(`${code}: the JSON-LD lists a free offer and a monthly seat offer`, () => {
    const html = render(code, "landing/json-ld.njk");
    const json = html.slice(html.indexOf("{ "), html.lastIndexOf("}") + 1);
    const [free, team] = JSON.parse(json).offers;
    assert.equal(free.price, "0");
    assert.equal(free.priceCurrency, "USD");
    assert.equal(team.price, "15");
    assert.equal(team.priceSpecification.price, "15");
    assert.equal(team.priceSpecification.referenceQuantity.unitCode, "MON");
    assert.equal(team.priceSpecification.unitText, t.pricing.team.unit);
    assert.ok(t.pricing.team.unit);
  });
}
