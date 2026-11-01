// The /data-partners page: the payout estimate and the structure/copy zip.
// The estimate is pinned to reference points sampled from the reference
// program's published estimator (employees, years, region → low, high in
// USD). Houston pays model.share of that curve, so every point, times the
// share, must come out within 2%.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import dataPartners from "../src/_data/dataPartners.js";
import en from "../src/_data/i18n/dataPartners/en.js";
import es from "../src/_data/i18n/dataPartners/es.js";
import pt from "../src/_data/i18n/dataPartners/pt.js";
import landing from "../src/_data/landing.js";
import {
  employeesAt,
  estimatePayout,
  LIMITS,
  positionFor,
  SLIDER_STEPS,
} from "../src/assets/payout-model.js";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const { model } = dataPartners;

// [employees, years, low, high], all US.
const US = [
  [1, 1, 116681, 196438],
  [1, 5, 151682, 254773],
  [1, 50, 545444, 920885],
  [2, 5, 153432, 257689],
  [5, 5, 158681, 269391],
  [10, 1, 132429, 222684],
  [10, 5, 167430, 290863],
  [10, 50, 565916, 1071163],
  [20, 5, 184928, 333806],
  [30, 5, 203016, 376750],
  [40, 5, 221104, 419694],
  [50, 5, 239192, 462638],
  [100, 1, 289907, 508771],
  [100, 2, 299838, 550918],
  [100, 3, 309770, 593064],
  [100, 5, 329633, 677356],
  [100, 10, 379290, 888088],
  [100, 20, 478605, 1309550],
  [100, 50, 776550, 2573938],
  [200, 5, 510514, 1106794],
  [500, 5, 1053158, 2395106],
  [1000, 1, 1875313, 3381459],
  [1000, 5, 1957564, 4542294],
  [1000, 50, 2882888, 17601688],
  [2000, 5, 3766376, 8836669],
  [5000, 5, 9192814, 21719794],
  [10000, 5, 18236876, 43191669],
];
// [region, employees, years, low, high]
const REGIONS = [
  ["Canada", 100, 5, 247224, 508017],
  ["Europe", 100, 5, 247224, 508017],
  ["Other", 100, 5, 98890, 203207],
  ["Other", 1000, 5, 587269, 1362688],
];

const near = (actual, expected, label) => {
  const error = Math.abs(actual - expected) / expected;
  assert.ok(error <= 0.02, `${label}: ${actual} vs ${expected}`);
};

const { share } = model;

test("Houston pays 60% of the reference curve", () => {
  assert.equal(share, 0.6);
});

test("the estimate matches every US reference point within 2%", () => {
  // Points under the 20-employee floor are out of range.
  const inRange = ([e]) => e >= LIMITS.employees.min;
  for (const [employees, years, low, high] of US.filter(inRange)) {
    const got = estimatePayout(model, { employees, years, region: "US" });
    near(got.low, low * share, `low ${employees}x${years}`);
    near(got.high, high * share, `high ${employees}x${years}`);
  }
});

test("the estimate scales by headquarters region", () => {
  for (const [region, employees, years, low, high] of REGIONS) {
    const got = estimatePayout(model, { employees, years, region });
    near(got.low, low * share, `low ${region}`);
    near(got.high, high * share, `high ${region}`);
  }
});

test("out-of-range or unknown inputs give no figure", () => {
  const bad = [
    { employees: 1, years: 5, region: "US" },
    { employees: 10001, years: 5, region: "US" },
    { employees: 100, years: 0, region: "US" },
    { employees: 100, years: 51, region: "US" },
    { employees: 1.5, years: 5, region: "US" },
    { employees: 100, years: 5, region: "Mars" },
  ];
  for (const inputs of bad) {
    assert.equal(estimatePayout(model, inputs), null, JSON.stringify(inputs));
  }
});

test("the no-JS figure is the default estimate, formatted per locale", () => {
  const range = estimatePayout(model, dataPartners.defaults);
  for (const code of ["en", "es", "pt"]) {
    const text = dataPartners.exampleText[code];
    assert.equal(Number(text.low.replace(/\D/g, "")), range.low, code);
    assert.equal(Number(text.high.replace(/\D/g, "")), range.high, code);
  }
});

for (const [code, copy] of Object.entries({ en, es, pt })) {
  test(`${code}: every structure array has its copy`, () => {
    const pairs = [
      ["regions", dataPartners.regionOrder, copy.estimator.regions],
      ["areas", dataPartners.areas, copy.why.areas],
      ["privacy", dataPartners.privacy, copy.privacy.points],
      ["steps", dataPartners.steps, copy.how.steps],
      ["tiers", [0, 1, 2], copy.payouts.tiers],
    ];
    for (const [name, structure, text] of pairs) {
      assert.equal(text.length, structure.length, name);
    }
    for (const item of copy.faq.items) assert.ok(item.q && item.a, item.q);
    for (const step of copy.how.steps)
      assert.ok(step.name && step.alt, step.name);
  });
}

test("the employees slider spans the limits on a log scale", () => {
  assert.equal(employeesAt(0), LIMITS.employees.min);
  assert.equal(employeesAt(SLIDER_STEPS), LIMITS.employees.max);
  assert.equal(LIMITS.employees.min, 20);
  assert.equal(employeesAt(positionFor(100)), 100);
  let previous = 0;
  for (let position = 0; position <= SLIDER_STEPS; position++) {
    const employees = employeesAt(position);
    assert.ok(employees >= previous, `position ${position}`);
    assert.ok(estimatePayout(model, { employees, years: 5, region: "US" }));
    previous = employees;
  }
});

test("the slider opens on the default head count", () => {
  assert.equal(
    employeesAt(dataPartners.slider.start),
    dataPartners.defaults.employees,
  );
});

test("every photo the page shows exists", () => {
  const files = [
    ...dataPartners.reel.map((clip) => `${dataPartners.reelDir}/${clip}.webp`),
    ...dataPartners.steps.map((clip) => `${dataPartners.reelDir}/${clip}.webp`),
  ];
  for (const file of files)
    assert.ok(existsSync(resolve(src, file.slice(1))), file);
});

test("every booking action points at the calendar", () => {
  assert.match(dataPartners.booking, /^https:\/\/calendly\.com\//);
});

test("the contact people have faces", () => {
  for (const id of dataPartners.people) assert.ok(landing.people[id]?.img, id);
});

test("the page is built at the path the footer links to", () => {
  for (const dir of ["", "es/", "pt/"]) {
    const stub = `${dir}${dataPartners.path}index.njk`;
    assert.ok(existsSync(resolve(src, stub)), stub);
  }
});
