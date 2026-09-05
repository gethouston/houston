import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { integrationLogoUrl } from "../src/integrations.ts";

const domainOf = (url: string) => new URL(url).searchParams.get("domain") ?? "";

describe("integrationLogoUrl", () => {
  it("maps Croma to its real brand domain — croma.com is an unrelated retailer", () => {
    assert.equal(domainOf(integrationLogoUrl("CROMA")), "usecroma.com");
  });

  it("maps HighLevel to gohighlevel.com — highlevel.com is not the CRM", () => {
    assert.equal(domainOf(integrationLogoUrl("highlevel")), "gohighlevel.com");
  });

  it("resolves the domain map case-insensitively (Houston slugs are lowercase)", () => {
    assert.equal(domainOf(integrationLogoUrl("croma")), "usecroma.com");
    assert.equal(domainOf(integrationLogoUrl("gmail")), "mail.google.com");
    assert.equal(domainOf(integrationLogoUrl("GMAIL")), "mail.google.com");
  });

  it("guessed domains drop separators — an underscore makes an invalid hostname the favicon service 404s", () => {
    assert.equal(domainOf(integrationLogoUrl("ONE_DRIVE")), "onedrive.com");
    assert.equal(domainOf(integrationLogoUrl("NOTION")), "notion.com");
  });
});
