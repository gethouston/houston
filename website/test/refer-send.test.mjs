// Where a referral goes: the row the form builds (assets/refer-model.js),
// the requests it makes (assets/refer-send.js), and the table it lands in
// (supabase/migrations/*_data_referrals.sql). The SQL is read here so the
// columns the public site may write stay the ones the form sends, and the
// statuses the table allows cover the page's referral tracker.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import refer from "../src/_data/refer.js";
import { referralRow } from "../src/assets/refer-model.js";
import { sendReferral } from "../src/assets/refer-send.js";

// The table and every later change to it, oldest first: the public site may
// write the columns all of their grants add up to.
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const sql = readdirSync(migrations)
  .filter((f) => /_data_referrals(_[a-z_]+)?\.sql$/.test(f))
  .sort()
  .map((f) => readFileSync(new URL(f, migrations), "utf8"))
  .join("\n");
const granted = [
  ...sql.matchAll(/grant insert \(([^)]*)\) on public\.data_referrals/g),
].flatMap((m) => m[1].split(",").map((c) => c.trim()));
const statuses = /status in \(([^)]*)\)/
  .exec(sql)[1]
  .split(",")
  .map((v) => v.trim().replace(/'/g, ""));

const input = {
  yourName: " Ana Ruiz ",
  yourEmail: "ana@gmail.com",
  listing: "law-firm",
  companyName: "Acme",
  website: "https://www.Acme.com/about",
  size: " about 120 ",
  years: "12",
  industry: "services",
  country: " Colombia ",
};
const where = { locale: "es", page: "/es/data-partners/refer/" };
const row = referralRow(input, where);
const config = {
  supabaseUrl: "https://db.example.co/",
  supabaseAnonKey: "anon-key",
  sheetEndpoint: "https://script.google.com/macros/s/x/exec",
};

// Records every call; answers the database with `status` (or throws).
const fakeFetch = (status) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith(config.supabaseUrl)) {
      if (status instanceof Error) throw status;
      return { status };
    }
    return { status: 0, type: "opaque" };
  };
  return { calls, fetch };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("the row carries exactly the columns the public site may write", () => {
  assert.deepEqual(Object.keys(row).sort(), [...granted].sort());
});

test("the table allows every state the referral tracker shows", () => {
  for (const state of refer.states) assert.ok(statuses.includes(state), state);
});

test("the row is trimmed, the website is its host, empty optionals are null", () => {
  assert.equal(row.referrer_name, "Ana Ruiz");
  assert.equal(row.company_website, "acme.com");
  assert.equal(row.listing, "law-firm");
  assert.equal(row.company_size, "about 120");
  assert.equal(row.years_in_business, 12);
  assert.equal(row.industry, "services");
  assert.equal(row.company_country, "Colombia");
  assert.equal(row.locale, "es");
  assert.equal(row.page, "/es/data-partners/refer/");
  assert.equal(referralRow({ ...input, listing: "" }, where).listing, null);
});

test("a referral is stored with one insert into data_referrals", async () => {
  const { calls, fetch } = fakeFetch(201);
  assert.equal(await sendReferral(row, config, fetch), "stored");
  const db = calls.find((c) => c.url.startsWith(config.supabaseUrl));
  assert.equal(db.url, "https://db.example.co/rest/v1/data_referrals");
  assert.equal(db.init.method, "POST");
  assert.deepEqual(
    { ...db.init.headers },
    {
      apikey: "anon-key",
      Authorization: "Bearer anon-key",
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  );
  assert.deepEqual(JSON.parse(db.init.body), row);
});

test("the sheet gets the same row, timestamped, without waiting on it", async () => {
  const { calls, fetch } = fakeFetch(201);
  await sendReferral(row, config, fetch);
  await tick();
  const sheet = calls.find((c) => c.url === config.sheetEndpoint);
  assert.equal(sheet.init.mode, "no-cors");
  assert.equal(sheet.init.headers["Content-Type"], "text/plain;charset=utf-8");
  const { submitted_at, ...sent } = JSON.parse(sheet.init.body);
  assert.deepEqual(sent, row);
  assert.ok(!Number.isNaN(Date.parse(submitted_at)));
});

test("anything but a 201 from the database is a failure", async () => {
  for (const status of [400, 401, 409, 500, new Error("offline")]) {
    const { fetch } = fakeFetch(status);
    assert.equal(await sendReferral(row, config, fetch), "failed", `${status}`);
  }
});

test("without a key the database is never called, and the referral fails", async () => {
  const { calls, fetch } = fakeFetch(201);
  const keyless = { ...config, supabaseAnonKey: "" };
  assert.equal(await sendReferral(row, keyless, fetch), "failed");
  await tick();
  assert.ok(calls.every((c) => !c.url.startsWith(config.supabaseUrl)));
});

test("without a sheet endpoint only the database is written", async () => {
  const { calls, fetch } = fakeFetch(201);
  const noSheet = { ...config, sheetEndpoint: "" };
  assert.equal(await sendReferral(row, noSheet, fetch), "stored");
  await tick();
  assert.equal(calls.length, 1);
});

// A referral is stored, never emailed: no part of the form (its markup, the
// script that sends it, the request that stores it) may hand off to a mail
// app, with JS or without it.
test("the referral form never opens an email", () => {
  for (const file of [
    "../src/_includes/refer/form.njk",
    "../src/_includes/refer/form-card.njk",
    "../src/_includes/refer/hero.njk",
    "../src/assets/refer-form.js",
    "../src/assets/refer-send.js",
  ]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /mailto:/i, file);
  }
  const form = readFileSync(
    new URL("../src/_includes/refer/form-card.njk", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(form, /<form[^>]*\saction=/, "the form has no action");
  assert.match(form, /class="rf-submit"[^>]*\sdisabled>/, "button ships off");
});
