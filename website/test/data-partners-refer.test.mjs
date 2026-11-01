// /data-partners and /data-partners/refer quote one program: the referral
// amounts are the reference program's at the share the estimator pays, a
// company qualifies at the same headcount on both pages, and the owner page's
// sample of requests points at real requests.

import assert from "node:assert/strict";
import test from "node:test";
import dataPartners from "../src/_data/dataPartners.js";
import refer from "../src/_data/refer.js";
import referListings from "../src/_data/referListings.js";
import { treeFor } from "./support/locale-tree.mjs";

const { share } = dataPartners.model;

test("refer amounts are the reference figures at the estimator's share", () => {
  assert.equal(refer.pay(100000), Math.round(100000 * share));
});

test("the headline amount is 10% of the most an open request pays", () => {
  const top = Math.max(...referListings.items.map((i) => i.dealMaxUsd));
  assert.equal(refer.topDealUsd, top);
  assert.equal(refer.headlineShare, 0.1);
  assert.equal(refer.amountUsd, Math.round(top * 0.1));
});

test("every request pays the headline share of its own top payout", () => {
  for (const item of referListings.items)
    assert.equal(
      item.referralUsd,
      Math.round(item.dealMaxUsd * refer.headlineShare),
      item.slug,
    );
});

test("the best request on the board pays exactly the headline amount", () => {
  const [best] = referListings.items;
  assert.equal(best.earnUsd, refer.amountUsd);
  for (const item of referListings.items)
    assert.ok(item.earnUsd <= refer.amountUsd, item.slug);
});

test("the owner page samples six requests from six industries", () => {
  const { featured, items } = referListings;
  assert.equal(featured.length, 6);
  for (const pick of featured)
    assert.deepEqual(
      pick,
      items.find((item) => item.slug === pick.slug),
    );
  assert.equal(new Set(featured.map((item) => item.category)).size, 6);
});

for (const code of ["en", "es", "pt"]) {
  const tree = treeFor(code);

  test(`${code}: both pages set the bar at the same headcount`, () => {
    const bar = String(refer.minEmployees);
    const qualify = tree.dataPartners.faq.items[1].a;
    assert.ok(qualify.includes(bar), qualify);
    assert.ok(tree.refer.faq.items[0].a.includes(bar));
    for (const slug of Object.keys(tree.referListings)) {
      const low = Number(/^(\d+)/.exec(tree.referListings[slug].size)?.[1]);
      if (low) assert.ok(low >= refer.minEmployees, `${slug}: ${low}`);
    }
  });

  test(`${code}: the refer copy states the per-request share and no bonus`, () => {
    const percent = `${refer.headlineShare * 100}%`;
    assert.ok(tree.refer.terms.groups[0].lines[1].includes(percent));
    const text = JSON.stringify(tree.refer).toLowerCase();
    assert.ok(!/bonus|bono|bônus/.test(text));
  });

  test(`${code}: the owner page quotes the referral amount, never a literal`, () => {
    const referral = tree.dataPartners.faq.items.find((item) => item.link);
    assert.ok(referral.a.includes("{amount}"));
    assert.ok(tree.dataPartners.requests.referLine.includes("{amount}"));
    assert.ok(!/\d/.test(referral.a), referral.a);
  });
}
