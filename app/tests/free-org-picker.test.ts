import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { BillingChoice } from "@houston/engine-adapter";
import { choiceDone, choiceModal } from "@houston/sdk";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import plan from "../src/locales/en/plan.json" with { type: "json" };
import planEs from "../src/locales/es/plan.json" with { type: "json" };
import planPt from "../src/locales/pt/plan.json" with { type: "json" };

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let steps: typeof import("../src/components/shell/free-org-picker-steps.tsx");
let done: typeof import("../src/components/shell/free-org-picker-done.tsx");
let intro: typeof import("../src/components/shell/billing-change-intro.tsx");
let avatar: typeof import("../src/components/shell/org-avatar.tsx");
let i18next: typeof import("i18next").default;
let Dialog: typeof import("@houston-ai/core").Dialog;

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["plan"],
    defaultNS: "plan",
    resources: { en: { plan }, es: { plan: planEs } },
  });
  steps = await import("../src/components/shell/free-org-picker-steps.tsx");
  done = await import("../src/components/shell/free-org-picker-done.tsx");
  ({ Dialog } = await import("@houston-ai/core"));
  intro = await import("../src/components/shell/billing-change-intro.tsx");
  avatar = await import("../src/components/shell/org-avatar.tsx");
});

const org = (slug: string, name: string, patch = {}) => ({
  slug,
  name,
  personal: false,
  memberCount: 1,
  messages30d: 0,
  lastActiveOn: null,
  monthlyTotalCents: null,
  seatGraceEndsOn: null,
  lockAt: null,
  ...patch,
});

const CHOICE: BillingChoice = {
  needed: true,
  payer: "plus",
  state: "pending",
  provisional: false,
  cutoverAt: "2026-10-23T05:00:00Z",
  changeableUntil: null,
  noticeDismissed: false,
  freeOrgSlug: null,
  paidOrgSlug: null,
  orgs: [
    org("3333333333333333", "daniel", {
      personal: true,
      messages30d: 12,
      monthlyTotalCents: 1500,
    }),
    org("2222222222222222", "Innova", {
      memberCount: 4,
      messages30d: 210,
      monthlyTotalCents: 6000,
      seatGraceEndsOn: "2026-11-22",
    }),
    org("1111111111111111", "La Fila", {
      messages30d: 396,
      monthlyTotalCents: 1500,
    }),
  ],
};

const doc = (element: ReactElement) =>
  new JSDOM(render(element)).window.document;
const title = (text: string) => h("h2", null, text);
const noop = () => undefined;

describe("the free-org picker", () => {
  const free = (payer: boolean) =>
    doc(
      h(steps.FreeStep, {
        choice: CHOICE,
        selected: "1111111111111111",
        onSelect: noop,
        payer,
        busy: false,
        title,
        onConfirm: noop,
      }),
    );

  it("lists the busiest org first, tagged and preselected, with its activity", () => {
    const page = free(false);
    const rows = [...page.querySelectorAll("label")].map((row) =>
      row.textContent?.trim(),
    );
    deepStrictEqual(rows, [
      "LFLa FilaMost active1 member · 396 messages in the last 30 days",
      "INInnova4 members · 210 messages in the last 30 days",
      "PEPersonal1 member · 12 messages in the last 30 days",
    ]);
    const checked = page.querySelector<HTMLInputElement>("input:checked");
    strictEqual(checked?.value, "1111111111111111");
    strictEqual(page.querySelector("button")?.textContent, "Keep La Fila free");
    strictEqual(page.body.textContent?.includes("Step 1 of 2"), false);
  });

  it("names a payer's first step and moves on with Next", () => {
    const page = free(true);
    ok(page.body.textContent?.startsWith("Step 1 of 2"));
    strictEqual(page.querySelector("button")?.textContent, "Next");
  });

  it("asks for a pick and holds the action until there is one", () => {
    const page = doc(
      h(steps.FreeStep, {
        choice: CHOICE,
        selected: "",
        onSelect: noop,
        payer: false,
        busy: false,
        title,
        onConfirm: noop,
      }),
    );
    strictEqual(page.querySelector("input:checked"), null);
    const button = page.querySelector("button");
    strictEqual(button?.textContent, "Pick an organization");
    strictEqual(button?.disabled, true);
  });

  const paid = (patch: { selected?: string; busy?: boolean }) =>
    doc(
      h(steps.PaidStep, {
        choice: CHOICE,
        freeSlug: "1111111111111111",
        selected: "2222222222222222",
        onSelect: noop,
        busy: false,
        title,
        onBack: noop,
        onConfirm: noop,
        ...patch,
      }),
    );
  const buttons = (page: Document) =>
    [...page.querySelectorAll("button")].map((b) => [
      b.textContent,
      b.disabled,
    ]);

  it("asks a payer for the paid pick when none is left", () => {
    deepStrictEqual(buttons(paid({ selected: "" })), [
      ["Pick an organization", true],
      ["Back", false],
    ]);
  });

  it("holds both of a payer's actions while the pick saves", () => {
    deepStrictEqual(buttons(paid({})), [
      ["Pay for Innova", false],
      ["Back", false],
    ]);
    deepStrictEqual(buttons(paid({ busy: true })), [
      ["Pay for Innova", true],
      ["Back", true],
    ]);
    const saving = doc(
      h(steps.FreeStep, {
        choice: CHOICE,
        selected: "1111111111111111",
        onSelect: noop,
        payer: false,
        busy: true,
        title,
        onConfirm: noop,
      }),
    );
    deepStrictEqual(buttons(saving), [["Keep La Fila free", true]]);
  });

  it("prices the payer step and keeps the free pick listed but disabled", () => {
    const page = doc(
      h(steps.PaidStep, {
        choice: CHOICE,
        freeSlug: "1111111111111111",
        selected: "2222222222222222",
        onSelect: noop,
        busy: false,
        title,
        onBack: noop,
        onConfirm: noop,
      }),
    );
    const text = page.body.textContent ?? "";
    ok(text.startsWith("Step 2 of 2Which one does your subscription pay for?"));
    const radios = [...page.querySelectorAll<HTMLInputElement>("input")].map(
      (input) => [input.value, input.checked, input.disabled],
    );
    deepStrictEqual(radios, [
      ["1111111111111111", false, true],
      ["2222222222222222", true, false],
      ["3333333333333333", false, false],
    ]);
    const rows = [...page.querySelectorAll("label")].map((row) =>
      row.textContent?.trim(),
    );
    deepStrictEqual(rows, [
      "LFLa FilaFreeStays free",
      "INInnova4 members · $15 each",
      "PEPersonal1 member · $15 each",
    ]);
    ok(
      text.includes(
        "Your price stays $15 a month until November 22, then it's $60 a month.",
      ),
    );
    const buttons = [...page.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    deepStrictEqual(buttons, ["Pay for Innova", "Back"]);
  });

  it("gives an org the same avatar tone wherever it shows", () => {
    const tones = (page: Document) =>
      [...page.querySelectorAll("[data-tone]")].map((avatar) =>
        avatar.getAttribute("data-tone"),
      );
    deepStrictEqual(tones(free(false)), ["crimson", "orange", "teal"]);
    const step = choiceDone({ ...CHOICE, freeOrgSlug: "3333333333333333" });
    ok(step);
    const success = doc(
      h(
        Dialog,
        { open: true },
        h(done.DoneStep, { done: step, onClose: noop }),
      ),
    );
    deepStrictEqual(tones(success), ["crimson", "orange", "teal"]);
  });
});

describe("an org avatar", () => {
  const initials = (name: string) =>
    doc(h(avatar.OrgAvatar, { slug: "1111111111111111", name })).body
      .textContent;

  it("takes the first letter of the first two words", () => {
    strictEqual(initials("la fila"), "LF");
    strictEqual(initials("Innova"), "IN");
  });

  it("keeps an emoji whole", () => {
    strictEqual(initials("🚀 Rocket"), "🚀R");
    strictEqual(initials("🚀rocket"), "🚀R");
    strictEqual(initials("🦄"), "🦄");
  });

  it("paints from the org tokens, never the agent palette", () => {
    const span = doc(
      h(avatar.OrgAvatar, { slug: "1111111111111111", name: "La Fila" }),
    ).querySelector("span");
    strictEqual(
      span?.getAttribute("style"),
      "--org-tone:var(--ht-org-crimson);--org-tone-deep:var(--ht-org-crimson-deep)",
    );
  });
});

/** The success step's title, lines, org rows and button for a stored choice. */
function doneText(stored: BillingChoice) {
  const step = choiceDone(stored);
  ok(step, "a stored pick has a success step");
  const page = doc(
    h(Dialog, { open: true }, h(done.DoneStep, { done: step, onClose: noop })),
  );
  return {
    title: page.querySelector("h2")?.textContent,
    lines: [...page.querySelectorAll("p")].map((line) => line.textContent),
    orgs: [...page.querySelectorAll("li")].map((row) =>
      [...row.querySelectorAll("span:not([aria-hidden])")].map(
        (cell) => cell.textContent,
      ),
    ),
    buttons: [...page.querySelectorAll("button")].map((b) => b.textContent),
  };
}

describe("the success step", () => {
  it("shows a non-payer which org stays free and that the rest need a plan", () => {
    deepStrictEqual(
      doneText({ ...CHOICE, payer: null, freeOrgSlug: "1111111111111111" }),
      {
        title: "La Fila stays free",
        lines: [
          "Here's how your organizations look from Friday, October 23.",
          "You can change this in Settings.",
        ],
        orgs: [
          ["La Fila", "Free"],
          ["Innova", "Needs a plan"],
          ["Personal", "Needs a plan"],
        ],
        buttons: ["Done"],
      },
    );
  });

  it("shows a payer which org the subscription pays for", () => {
    deepStrictEqual(
      doneText({
        ...CHOICE,
        freeOrgSlug: "3333333333333333",
        paidOrgSlug: "2222222222222222",
      }).orgs,
      [
        ["La Fila", "Needs a plan"],
        ["Innova", "Your subscription"],
        ["Personal", "Free"],
      ],
    );
  });

  it("speaks the reader's current language, date included", async () => {
    await i18next.changeLanguage("es");
    try {
      const { lines, orgs } = doneText({
        ...CHOICE,
        freeOrgSlug: "1111111111111111",
        paidOrgSlug: "2222222222222222",
      });
      strictEqual(
        lines[0],
        "Así quedan tus organizaciones desde el viernes, 23 de octubre.",
      );
      deepStrictEqual(orgs, [
        ["La Fila", "Gratis"],
        ["Innova", "Tu suscripción"],
        ["Personal", "Necesita un plan"],
      ]);
    } finally {
      await i18next.changeLanguage("en");
    }
  });
});

/** The intro the modal opens on: its date chip, points and actions. */
function introText(choice: BillingChoice) {
  const shown = choiceModal(choice, {
    now: Date.parse("2026-10-20T17:00:00.000Z"),
    locale: i18next.language,
    closedThisSession: false,
    otherDialogOpen: false,
  });
  if (!shown.open) return "closed";
  const { notice } = shown;
  if (notice.kind === "confirm" || notice.kind === "applied")
    throw new Error(`not an intro notice: ${notice.kind}`);
  const page = doc(
    h(
      Dialog,
      { open: true },
      h(intro.BillingChangeIntro, {
        notice,
        choice,
        onPick: noop,
        onClose: noop,
      }),
    ),
  );
  return {
    head: [...page.querySelectorAll(":scope body > p, h2")].map(
      (line) => line.textContent,
    ),
    points: [...page.querySelectorAll("li")].map((point) =>
      [...point.querySelectorAll("p")].map((line) => line.textContent),
    ),
    buttons: [...page.querySelectorAll("button")].map((b) => b.textContent),
  };
}

const HEAD = [
  "From Friday, October 23",
  "Teams are out of beta",
  "Thanks for helping us shape how teams work in Houston.",
];
const TEAM_ANY = [
  "Every space works like a team",
  "Personal and team spaces become the same thing, so you can invite people to any of them.",
];
const ONE_FREE = [
  "One free organization per account",
  "It keeps working the way it does today.",
];

const SINGLE = {
  ...CHOICE,
  needed: false,
  payer: null,
  orgs: [{ ...CHOICE.orgs[2] }],
};

describe("the announcement", () => {
  it("asks an owner to choose, with the date and no price", () => {
    deepStrictEqual(introText({ ...CHOICE, payer: null }), {
      head: HEAD,
      points: [
        TEAM_ANY,
        ONE_FREE,
        [
          "Pick the one to keep free",
          "Made a few just to try things? Choose yours and we'll handle the rest.",
        ],
      ],
      buttons: ["Choose my free organization", "Maybe later"],
    });
  });

  it("tells a payer the subscription comes with them", () => {
    const shown = introText(CHOICE);
    ok(shown !== "closed");
    deepStrictEqual(shown.points[2], [
      "Your subscription comes with you",
      "Pick the organization that stays free and the one your subscription pays for.",
    ]);
  });

  it("names the one org that stays free, or that the subscription pays for", () => {
    const named = [
      "Every space works like a team",
      "Personal and team spaces become the same thing, so you can invite people to La Fila.",
    ];
    const nothing = "Nothing to do. It keeps working the way it does today.";
    deepStrictEqual(introText(SINGLE), {
      head: HEAD,
      points: [named, ["La Fila stays free", nothing]],
      buttons: ["Got it"],
    });
    const payer = introText({ ...SINGLE, payer: "plus" });
    ok(payer !== "closed");
    deepStrictEqual(payer.points[1], [
      "Your subscription pays for La Fila",
      nothing,
    ]);
  });

  it("tells a member in someone else's org there is nothing to do", () => {
    deepStrictEqual(introText({ ...SINGLE, orgs: [] }), {
      head: HEAD,
      points: [
        TEAM_ANY,
        [
          "Nothing to do on your side",
          "The teams you're in keep working like today.",
        ],
      ],
      buttons: ["Got it"],
    });
  });

  it("says nothing once the pick is stored", () => {
    strictEqual(
      introText({ ...CHOICE, freeOrgSlug: "1111111111111111" }),
      "closed",
    );
  });

  it("names the date in the reader's language", async () => {
    await i18next.changeLanguage("es");
    try {
      const shown = introText({ ...CHOICE, payer: null });
      ok(shown !== "closed");
      deepStrictEqual(shown.head, [
        "Desde el viernes, 23 de octubre",
        "Los equipos salieron de beta",
        "Gracias por ayudarnos a darle forma a cómo funcionan los equipos en Houston.",
      ]);
    } finally {
      await i18next.changeLanguage("en");
    }
  });

  it("never states the free org's weekly message count, in any language", () => {
    for (const locale of [plan, planEs, planPt]) {
      const text = JSON.stringify(locale.choice);
      ok(!/\{\{limit\}\}|\b40\b/.test(text), text);
    }
  });
});
