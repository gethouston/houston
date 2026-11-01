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
import referEn from "../src/_data/i18n/refer/en.js";
import landing from "../src/_data/landing.js";
import refer from "../src/_data/refer.js";
import { composeMail, siteHost, validate } from "../src/assets/refer-model.js";
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
      ["sizes", refer.sizes, copy.form.sizes],
      ["states", refer.states, copy.track.states],
    ];
    for (const [name, structure, text] of pairs) {
      assert.equal(text.length, structure.length, name);
    }
  });

  test(`${code}: the only placeholders are the ones the templates fill`, () => {
    const filled = new Set(["{amount}", "{inbox}", "{company}"]);
    for (const line of strings(copy)) {
      for (const hole of line.match(/\{[^}]*\}/g) ?? []) {
        assert.ok(filled.has(hole), `${hole} in "${line}"`);
      }
    }
    assert.match(copy.form.done.fallback, /\{inbox\}/);
    assert.match(copy.form.mail.subject, /\{company\}/);
  });

  // The figure is written once, in _data/refer.js; the copy states the
  // headcount and the open-referral cap in words, so hold those to it.
  test(`${code}: the copy states the program's terms`, () => {
    assert.equal(
      Number(refer.amountText[code].replace(/\D/g, "")),
      refer.amountUsd,
    );
    const headcount = String(refer.fullAmountEmployees);
    assert.ok(copy.hero.card.terms[0].includes(headcount));
    assert.ok(copy.terms.groups[0].lines[0].includes(headcount));
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

const sizes = refer.sizes;
const valid = {
  yourName: "Ana Ruiz",
  yourEmail: "ana@gmail.com",
  companyName: "Acme",
  website: "https://www.Acme.com/about",
  size: "50-199",
  contactName: "Bo Li",
  contactEmail: "bo@acme.com",
  contactLinkedin: "",
  fit: "",
};

test("a complete referral passes", () => {
  assert.deepEqual(validate(valid, sizes), {});
});

test("an empty form names every required field, and no optional one", () => {
  assert.deepEqual(Object.keys(validate({}, sizes)).sort(), [
    "companyName",
    "contactEmail",
    "contactName",
    "size",
    "website",
    "yourEmail",
    "yourName",
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
  assert.deepEqual(validate(own, sizes), { website: "sameCompany" });
  const sub = { ...valid, yourEmail: "ana@mail.acme.com" };
  assert.deepEqual(validate(sub, sizes), { website: "sameCompany" });
  const lookalike = { ...valid, yourEmail: "ana@notacme.com" };
  assert.deepEqual(validate(lookalike, sizes), {});
});

test("a LinkedIn link is optional, but must be a profile when given", () => {
  for (const ok of [
    "linkedin.com/in/boli",
    "https://www.linkedin.com/in/bo-li/",
  ]) {
    assert.deepEqual(
      validate({ ...valid, contactLinkedin: ok }, sizes),
      {},
      ok,
    );
  }
  const bad = { ...valid, contactLinkedin: "twitter.com/boli" };
  assert.deepEqual(validate(bad, sizes), {
    contactLinkedin: "contactLinkedin",
  });
});

test("a size outside the list is refused", () => {
  assert.deepEqual(validate({ ...valid, size: "lots" }, sizes), {
    size: "size",
  });
});

test("the email names the company and carries every filled field", () => {
  const form = referEn.form;
  const copy = {
    inbox: refer.inbox,
    mail: form.mail,
    labels: {
      companyName: form.companyName,
      website: form.website,
      size: form.size,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactLinkedin: form.contactLinkedin,
      fit: form.fit,
    },
  };
  const mail = composeMail({ ...valid, fit: "We met at a conference." }, copy);
  assert.equal(mail.subject, "Referral: Acme");
  assert.ok(mail.href.startsWith(`mailto:${refer.inbox}?subject=`));
  assert.match(mail.body, /^Referred by: Ana Ruiz <ana@gmail\.com>/);
  assert.match(mail.body, /Company website: acme\.com/);
  assert.match(
    mail.body,
    /Why are they a good fit\?: We met at a conference\./,
  );
  assert.doesNotMatch(mail.body, /LinkedIn/);
});
