import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  englishSetupGreeting,
  roleInSentence,
  setupGreetingCopy,
  setupGreetingVariant,
} from "@houston/sdk/first-day";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

describe("setupGreetingVariant", () => {
  it("names the job when there is one", () => {
    strictEqual(
      setupGreetingVariant("Nova", "Financial analyst"),
      "textWithRole",
    );
  });

  it("says only the name when there is no job", () => {
    strictEqual(setupGreetingVariant("Nova", null), "text");
    strictEqual(setupGreetingVariant("Nova", "   "), "text");
  });

  it("says only the job when the name is the job", () => {
    strictEqual(
      setupGreetingVariant("Executive assistant", "Executive assistant"),
      "textRoleAsName",
    );
    strictEqual(
      setupGreetingVariant(" executive ASSISTANT ", "Executive assistant  "),
      "textRoleAsName",
    );
  });
});

describe("roleInSentence", () => {
  it("lowercases a job title's first letter", () => {
    strictEqual(roleInSentence("Executive assistant"), "executive assistant");
    strictEqual(
      roleInSentence("  Asistente ejecutivo "),
      "asistente ejecutivo",
    );
  });

  it("keeps a leading acronym as written", () => {
    strictEqual(roleInSentence("CFO"), "CFO");
    strictEqual(roleInSentence("HR manager"), "HR manager");
  });

  it("lowercases a one-letter first word like any other", () => {
    strictEqual(roleInSentence("A buyer"), "a buyer");
  });
});

describe("setupGreetingCopy", () => {
  it("hands the locale the name and the mid-sentence job", () => {
    deepStrictEqual(setupGreetingCopy("Nova", "Financial analyst"), {
      variant: "textWithRole",
      params: { name: "Nova", role: "financial analyst" },
    });
    deepStrictEqual(setupGreetingCopy("Nova", null), {
      variant: "text",
      params: { name: "Nova" },
    });
    deepStrictEqual(
      setupGreetingCopy("Executive assistant", "Executive assistant"),
      {
        variant: "textRoleAsName",
        params: { name: "Executive assistant", role: "executive assistant" },
      },
    );
  });
});

describe("englishSetupGreeting", () => {
  it("is the en locale copy, word for word, for every variant", () => {
    const cases: Array<[string, string | null]> = [
      ["Nova", "Financial analyst"],
      ["Nova", null],
      ["Executive assistant", "Executive assistant"],
    ];
    for (const [name, role] of cases) {
      const { variant, params } = setupGreetingCopy(name, role);
      const rendered = en.setupGreeting[variant]
        .replace("{{name}}", params.name)
        .replace("{{role}}", params.role ?? "");
      strictEqual(englishSetupGreeting(name, role), rendered);
    }
  });

  it("reads as separate paragraphs ending on the ideas lead-in", () => {
    const text = englishSetupGreeting("Nova", "Financial analyst");
    strictEqual(text.split("\n\n").length, 4);
    strictEqual(
      text.startsWith(
        "Hi, I'm **Nova**, your financial analyst! Today is my *first day*,",
      ),
      true,
    );
    strictEqual(
      text.endsWith("Here are a few tasks we could start with:"),
      true,
    );
  });
});

describe("chat:setupGreeting locales", () => {
  it("every language has the same variants, paragraphs and placeholders", () => {
    for (const locale of [en, es, pt]) {
      strictEqual(locale.setupGreeting.text.includes("{{role}}"), false);
      strictEqual(
        locale.setupGreeting.textRoleAsName.includes("{{name}}"),
        false,
      );
      for (const text of Object.values(locale.setupGreeting)) {
        strictEqual(text.split("\n\n").length, 4);
        strictEqual(text.includes("—"), false);
      }
    }
  });
});
