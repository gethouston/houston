// The /data-partners "Book a call" popup: the rules its form follows
// (assets/data-partners-call-model.js), the request it makes
// (assets/data-partners-call-send.js), the table it lands in
// (supabase/migrations/*_data_partner_calls.sql), and the page wiring that
// makes every booking link open it.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import dataPartners from "../src/_data/dataPartners.js";
import en from "../src/_data/i18n/dataPartners/en.js";
import {
  bookingUrl,
  callRow,
  FIELDS,
  MIN_EMPLOYEES,
  qualifies,
  validate,
} from "../src/assets/data-partners-call-model.js";
import { sendCall } from "../src/assets/data-partners-call-send.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const sql = readdirSync(migrations)
  .filter((f) => /_data_partner_calls(_[a-z_]+)?\.sql$/.test(f))
  .sort()
  .map((f) => readFileSync(new URL(f, migrations), "utf8"))
  .join("\n");
const granted = [
  ...sql.matchAll(/grant insert \(([^)]*)\) on public\.data_partner_calls/g),
].flatMap((m) => m[1].split(",").map((c) => c.trim()));

const input = {
  name: " Ana Ruiz ",
  country: "Colombia",
  phoneCode: "+57",
  phone: " 300 123 4567 ",
  email: "ana@acme.co",
  company: " Acme ",
  website: "https://www.Acme.co/about",
  employees: "120",
  years: "8",
};
const where = { locale: "es", page: "/es/data-partners/", source: "hero" };
const row = callRow(input, where);
const config = {
  supabaseUrl: "https://db.example.co/",
  supabaseAnonKey: "anon-key",
  sheetEndpoint: "https://script.google.com/macros/s/x/exec",
};

const fakeFetch = (status) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith(config.supabaseUrl)) return { status };
    return { status: 0, type: "opaque" };
  };
  return { calls, fetch };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a complete form has no errors", () => {
  assert.deepEqual(validate(input), {});
});

test("every field is required and checked", () => {
  const wrong = {
    name: "  ",
    country: "",
    phone: "12",
    email: "ana@",
    company: "",
    website: "not a site",
    employees: "about 50",
    years: "-3",
  };
  for (const [field, value] of Object.entries(wrong)) {
    assert.deepEqual(
      Object.keys(validate({ ...input, [field]: value })),
      [field],
      field,
    );
  }
  assert.deepEqual(Object.keys(validate({})).sort(), [...FIELDS].sort());
});

test("the phone needs a country code beside it", () => {
  assert.ok(validate({ ...input, phoneCode: "" }).phone);
  assert.ok(validate({ ...input, phoneCode: "57" }).phone);
  assert.deepEqual(validate({ ...input, phone: "(300) 123-4567" }), {});
});

test("a company has at least one employee, years can start at zero", () => {
  assert.ok(validate({ ...input, employees: "0" }).employees);
  assert.ok(validate({ ...input, employees: "12.5" }).employees);
  assert.deepEqual(validate({ ...input, years: "0" }), {});
});

test("the calendar is offered from the program's 20-employee bar", () => {
  assert.equal(MIN_EMPLOYEES, 20);
  assert.match(en.faq.items[1].a, /at least 20 full-time employees/);
  assert.equal(qualifies("19"), false);
  assert.equal(qualifies("20"), true);
  assert.equal(qualifies("120"), true);
});

test("the calendar opens with the visitor's name and email filled in", () => {
  const url = new URL(bookingUrl(dataPartners.booking, input));
  assert.equal(url.origin + url.pathname, dataPartners.booking);
  assert.equal(url.searchParams.get("name"), "Ana Ruiz");
  assert.equal(url.searchParams.get("email"), "ana@acme.co");
});

test("the row carries exactly the columns the public site may write", () => {
  assert.deepEqual(Object.keys(row).sort(), [...granted].sort());
});

test("the row is trimmed, numbers are numbers, the website is its host", () => {
  assert.deepEqual(row, {
    full_name: "Ana Ruiz",
    country: "Colombia",
    phone: "+57 300 123 4567",
    phone_country_code: "+57",
    email: "ana@acme.co",
    company_name: "Acme",
    company_website: "acme.co",
    employees: 120,
    years_in_business: 8,
    source: "hero",
    locale: "es",
    page: "/es/data-partners/",
  });
});

test("a request is stored with one insert into data_partner_calls", async () => {
  const { calls, fetch } = fakeFetch(201);
  assert.equal(await sendCall(row, config, fetch), "stored");
  const db = calls.find((c) => c.url.startsWith(config.supabaseUrl));
  assert.equal(db.url, "https://db.example.co/rest/v1/data_partner_calls");
  assert.equal(db.init.method, "POST");
  assert.equal(db.init.headers.apikey, "anon-key");
  assert.equal(db.init.headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(db.init.body), row);
});

test("the sheet gets the same row, timestamped", async () => {
  const { calls, fetch } = fakeFetch(201);
  await sendCall(row, config, fetch);
  await tick();
  const sheet = calls.find((c) => c.url === config.sheetEndpoint);
  assert.equal(sheet.init.mode, "no-cors");
  const { submitted_at, ...sent } = JSON.parse(sheet.init.body);
  assert.deepEqual(sent, row);
  assert.ok(!Number.isNaN(Date.parse(submitted_at)));
});

test("anything but a 201, or no key, is a failure", async () => {
  for (const status of [400, 401, 500]) {
    const { fetch } = fakeFetch(status);
    assert.equal(await sendCall(row, config, fetch), "failed", `${status}`);
  }
  const { calls, fetch } = fakeFetch(201);
  const keyless = { ...config, supabaseAnonKey: "" };
  assert.equal(await sendCall(row, keyless, fetch), "failed");
  assert.ok(calls.every((c) => !c.url.startsWith(config.supabaseUrl)));
});

test("the sheet's columns are the row's fields", () => {
  const script = read("../scripts/apps-script/data-partnerships-calls.gs");
  const keys = [...script.matchAll(/\["[^"]+", "([a-z_]+)"\]/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(keys.sort(), [...Object.keys(row), "submitted_at"].sort());
});

// Every booking link on the page opens the popup, and keeps the calendar as
// its href so it still books a call without JS.
test("every booking link on the page opens the popup", () => {
  const files = ["nav", "hero", "estimator", "contact"].map((name) =>
    read(`../src/_includes/data-partners/${name}.njk`),
  );
  const links = files.flatMap((text) => [
    ...text.matchAll(/<a [^>]*href="\{\{ dataPartners\.booking \}\}"[^>]*>/g),
  ]);
  assert.equal(links.length, 5);
  const sources = links.map((m) => /data-call-trigger="([a-z]+)"/.exec(m[0]));
  assert.ok(sources.every(Boolean), "every link has a trigger");
  assert.equal(new Set(sources.map((s) => s[1])).size, 5, "named apart");
});

test("the popup has a field for everything the form checks", () => {
  const modal = read("../src/_includes/data-partners/call-modal.njk");
  const page = read("../src/_includes/data-partners.njk");
  assert.match(page, /include "data-partners\/call-modal\.njk"/);
  assert.match(page, /src="\/assets\/data-partners-call\.js"/);
  // A field is either written out or one call of the template's macro.
  for (const name of FIELDS) {
    const field = new RegExp(`id="dpc-f-${name}"|field\\("${name}"`);
    assert.match(modal, field, name);
  }
  assert.match(modal, /name="phoneCode"/);
});
