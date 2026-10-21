// The published price and the copy around it (src/_data/pricing.js and the
// landing translations). Teams pay one monthly price per seat, with no annual
// plan and no free trial, so neither may come back through the data or a
// translation, and the free allowance is never given a number.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import en from "../src/_data/i18n/en.js";
import es from "../src/_data/i18n/es.js";
import pt from "../src/_data/i18n/pt.js";
import pricing from "../src/_data/pricing.js";

const locales = { en, es, pt };
const strings = (value) =>
  typeof value === "string"
    ? [value]
    : Object.values(value ?? {}).flatMap(strings);
const pricingCopy = (t) => [...strings(t.pricing), ...strings(t.faq.groups)];

test("the team plan is 15 per seat per month and nothing else", () => {
  const data = pricing();
  assert.equal(data.teamMonthly, 15);
  assert.equal(data.currencyCode, "USD");
  assert.equal("teamAnnual" in data, false);
  assert.equal("trialDays" in data, false);
});

test("no template reads a retired price field", async () => {
  for (const file of [
    "../src/_includes/landing/pricing.njk",
    "../src/_includes/landing/faq.njk",
    "../src/_includes/landing.njk",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /teamAnnual|trialDays/, file);
  }
});

for (const [code, t] of Object.entries(locales)) {
  test(`${code}: no trial, no annual price, no stated free allowance`, () => {
    for (const line of pricingCopy(t)) {
      assert.doesNotMatch(line, /\{days\}/, line);
      assert.doesNotMatch(
        line,
        /trial|prueba|teste|annual|anual|por año|por ano/i,
        line,
      );
      // The free pool size is the server's to set, never the site's.
      assert.doesNotMatch(line, /\d+\s*(messages|mensajes|mensagens)/i, line);
    }
  });

  test(`${code}: the pricing FAQ names the seat price`, () => {
    const answers = strings(t.faq.groups).join("\n");
    assert.match(answers, /\{price\}/);
  });
}
