// The published price and the copy around it (src/_data/pricing.js, the
// landing translations, and the partials that render them). A Team seat is
// one price billed monthly, or a lower one billed yearly, with no free trial,
// so a trial may never come back through the data or a translation, and the
// free allowance is never given a number.
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

// A bare "free" reads as unlimited forever. The plan is always the free tier,
// worded as the app words it (app/tests/free-tier-copy.test.ts).
const BARE_FREE = {
  en: /\bfree\b(?! tier)/i,
  es: /\bgratis\b|\bgratuit[oa]s?\b(?<!nivel gratuito)/i,
  pt: /\bgrátis\b|\bgratuit[oa]s?\b(?<!nível gratuito)/i,
};

test("a team seat is 20 a month, or 180 a year (15 a month) billed yearly", () => {
  const data = pricing();
  assert.equal(data.teamMonthly, 20);
  assert.equal(data.teamYearly, 180);
  assert.equal(data.teamYearlyPerMonth, 15);
  assert.equal(data.teamYearlyPerMonth * 12, data.teamYearly);
  assert.equal(data.currencyCode, "USD");
  assert.equal("teamAnnual" in data, false);
  assert.equal("trialDays" in data, false);
  for (const code of locales.order) assert.ok(data.currency[code], code);
});

test("the landing page includes every pricing partial", async () => {
  const source = (await readFile(`${includes}/landing.njk`, "utf8")).replace(
    /\{#[\s\S]*?#\}/g,
    "",
  );
  for (const file of [
    "landing/pricing.njk",
    "landing/faq.njk",
    "landing/json-ld.njk",
  ]) {
    const include = new RegExp(
      `\\{%-?\\s*include\\s+"${escapeRegExp(file)}"\\s*-?%\\}`,
    );
    assert.match(source, include, file);
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

  test(`${code}: no trial, hardcoded price, personal space or free allowance size`, () => {
    for (const section of ["meta", "pricing", "faq", "footer"]) {
      for (const [path, line] of leaves(t[section], section)) {
        assert.doesNotMatch(line, /\{days\}/, path);
        assert.doesNotMatch(line, /trial|prueba|teste/i, path);
        // Prices come from _data/pricing.js through placeholders.
        assert.doesNotMatch(line, /\$\s*\d/, path);
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

  test(`${code}: never says free without the tier`, () => {
    const bare = leaves(t)
      .filter(([, line]) => BARE_FREE[code].test(line))
      .map(([path, line]) => `${path}: ${line}`);
    assert.deepEqual(bare, []);
  });

  test(`${code}: price placeholders appear only where a template fills them`, () => {
    const holders = leaves(t)
      .filter(([, line]) => /\{(price|yearlyPrice|yearlyTotal)\}/.test(line))
      .map(([path]) => path);
    assert.ok(holders.length > 0);
    for (const path of holders) {
      assert.match(
        path,
        /^(faq\.groups\[\d+\]\.items\[\d+\]\.aHtml|pricing\.team\.noteYearly)$/,
        path,
      );
    }
    assert.match(t.pricing.team.noteYearly, /\{yearlyTotal\}/);
  });

  test(`${code}: the Team card carries both prices, monthly showing by default`, () => {
    const html = render(code, "landing/pricing.njk");
    // Monthly until the switch says otherwise, which is also the no-JS view.
    assert.match(
      html,
      /<section id="pricing" class="section" data-period="month">/,
    );
    const show = (period) =>
      [...html.matchAll(new RegExp(`data-show="${period}">([^<]*)<`, "g"))].map(
        ([, text]) => text,
      );
    assert.deepEqual(show("month"), [`${currency}20`, t.pricing.team.note]);
    assert.deepEqual(show("year"), [
      `${currency}15`,
      t.pricing.team.noteYearly.replace("{yearlyTotal}", `${currency}180`),
    ]);
    assert.ok(html.includes(`class="amount">${currency}0<`), "free price");
    assert.doesNotMatch(html, /\{(price|yearlyPrice|yearlyTotal|days)\}/);
    assert.ok(html.includes(t.pricing.team.cta));
  });

  test(`${code}: the Monthly / Yearly switch is two pressable buttons`, () => {
    const html = render(code, "landing/pricing.njk");
    const group = html.match(
      /<div class="price-period" role="group" aria-label="([^"]+)">([\s\S]*?)<\/div>/,
    );
    assert.ok(group, "switch group");
    assert.equal(group[1], t.pricing.period.label);
    const buttons = [
      ...group[2].matchAll(
        /<button type="button" data-period-choice="(\w+)" aria-pressed="(true|false)">([^<]+)<\/button>/g,
      ),
    ].map(([, period, pressed, label]) => ({ period, pressed, label }));
    assert.deepEqual(buttons, [
      { period: "month", pressed: "true", label: t.pricing.period.month },
      { period: "year", pressed: "false", label: t.pricing.period.year },
    ]);
    // The script flips data-period on the section and aria-pressed on both.
    assert.match(html, /setAttribute\("data-period"/);
    assert.match(html, /setAttribute\("aria-pressed"/);
  });

  test(`${code}: the FAQ renders both seat prices`, () => {
    const html = render(code, "landing/faq.njk");
    for (const amount of [20, 15, 180]) {
      assert.match(
        html,
        new RegExp(`[\\s>(]${escapeRegExp(currency)}${amount}[ )]`),
        String(amount),
      );
    }
    assert.doesNotMatch(html, /\{(price|yearlyPrice|yearlyTotal|days)\}/);
  });

  test(`${code}: the JSON-LD lists the free tier and a monthly and a yearly seat offer`, () => {
    const html = render(code, "landing/json-ld.njk");
    const json = html.slice(html.indexOf("{ "), html.lastIndexOf("}") + 1);
    const offers = JSON.parse(json).offers;
    assert.equal(offers.length, 3);
    const [free, monthly, yearly] = offers;
    assert.equal(free.price, "0");
    assert.equal(free.priceCurrency, "USD");
    const expect = [
      [monthly, "20", "MON", t.pricing.team.unit, t.pricing.period.month],
      [yearly, "180", "ANN", t.pricing.team.unitYearly, t.pricing.period.year],
    ];
    for (const [offer, price, unitCode, unitText, period] of expect) {
      assert.equal(offer["@type"], "Offer");
      assert.equal(offer.name, `${t.pricing.team.name} (${period})`);
      assert.equal(offer.price, price);
      assert.equal(offer.priceCurrency, "USD");
      const spec = offer.priceSpecification;
      assert.equal(spec["@type"], "UnitPriceSpecification");
      assert.equal(spec.price, price);
      assert.equal(spec.priceCurrency, "USD");
      assert.ok(unitText, unitCode);
      assert.equal(spec.unitText, unitText);
      assert.deepEqual(spec.referenceQuantity, {
        "@type": "QuantitativeValue",
        value: 1,
        unitCode,
      });
    }
  });
}

test("the CSS hides the inactive price for the attributes the template uses", async () => {
  const css = await readFile(new URL("../src/assets/css/landing-marketing.css", import.meta.url), "utf8");
  const tpl = await readFile(new URL("../src/_includes/landing/pricing.njk", import.meta.url), "utf8");
  assert.match(tpl, /data-show="month"/);
  assert.match(tpl, /data-show="year"/);
  assert.ok(css.includes('#pricing[data-period="month"] .price-swap > [data-show="year"]'));
  assert.ok(css.includes('#pricing[data-period="year"] .price-swap > [data-show="month"]'));
});
