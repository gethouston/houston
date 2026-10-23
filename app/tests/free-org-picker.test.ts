import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { BillingChoice, SeatPrices } from "@houston/engine-adapter";
import { choiceDone, choiceModal } from "@houston/sdk";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import plan from "../src/locales/en/plan.json" with { type: "json" };
import planEs from "../src/locales/es/plan.json" with { type: "json" };
import planPt from "../src/locales/pt/plan.json" with { type: "json" };
import { enterNativeApp } from "./support/native-surface.ts";

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
  const free = (patch: Record<string, unknown> = {}) =>
    doc(
      h(steps.FreeStep, {
        choice: CHOICE,
        selected: "1111111111111111",
        onSelect: noop,
        paidSlug: null,
        busy: false,
        title,
        progress: null,
        onConfirm: noop,
        ...patch,
      }),
    );
  const buttons = (page: Document) =>
    [...page.querySelectorAll("button")].map((b) => [
      b.textContent,
      b.disabled,
    ]);
  const rows = (page: Document) =>
    [...page.querySelectorAll("label")].map((row) => row.textContent?.trim());

  it("lists the busiest org first, tagged and preselected, with its activity", () => {
    const page = free();
    deepStrictEqual(rows(page), [
      "LFLa FilaMost active1 member · 396 messages in the last 30 days",
      "INInnova4 members · 210 messages in the last 30 days",
      "PEPersonal1 member · 12 messages in the last 30 days",
    ]);
    const checked = page.querySelector<HTMLInputElement>("input:checked");
    strictEqual(checked?.value, "1111111111111111");
    ok(
      page.body.textContent?.startsWith(
        "Which organization stays on the free tier?Everyone in it shares the free tier's weekly limit.",
      ),
    );
    deepStrictEqual(buttons(page), [["Keep La Fila on the free tier", false]]);
  });

  it("asks for a pick and holds the action until there is one", () => {
    deepStrictEqual(buttons(free({ selected: "" })), [
      ["Pick an organization", true],
    ]);
  });

  it("lists a payer's subscription org disabled, with its progress and Back", () => {
    const page = free({
      paidSlug: "1111111111111111",
      selected: "2222222222222222",
      progress: { current: 4, total: 5 },
      onBack: noop,
    });
    ok(page.body.textContent?.startsWith("Step 4 of 5Which organization"));
    deepStrictEqual(rows(page), [
      "LFLa FilaYour subscription1 member · 396 messages in the last 30 days",
      "INInnova4 members · 210 messages in the last 30 days",
      "PEPersonal1 member · 12 messages in the last 30 days",
    ]);
    const radios = [...page.querySelectorAll<HTMLInputElement>("input")].map(
      (input) => [input.value, input.checked, input.disabled],
    );
    deepStrictEqual(radios, [
      ["1111111111111111", false, true],
      ["2222222222222222", true, false],
      ["3333333333333333", false, false],
    ]);
    deepStrictEqual(buttons(page), [
      ["Keep Innova on the free tier", false],
      ["Back", false],
    ]);
  });

  const paid = (patch: Record<string, unknown> = {}) =>
    doc(
      h(steps.PaidStep, {
        choice: CHOICE,
        selected: "1111111111111111",
        onSelect: noop,
        busy: false,
        title,
        progress: { current: 3, total: 5 },
        onBack: noop,
        onConfirm: noop,
        ...patch,
      }),
    );

  it("asks a payer first which org the subscription covers, priced per member", () => {
    const page = paid();
    ok(
      page.body.textContent?.startsWith(
        "Step 3 of 5You already pay for HoustonWhich organization does your subscription cover?",
      ),
    );
    deepStrictEqual(rows(page), [
      "LFLa FilaMost active1 member · $15 each",
      "INInnova4 members · $15 each",
      "PEPersonal1 member · $15 each",
    ]);
    ok(!/a month until|Pay for/.test(page.body.textContent ?? ""));
    deepStrictEqual(buttons(page), [
      ["Use it for La Fila", false],
      ["Back", false],
    ]);
  });

  it("asks a payer for the paid pick when none is left, and holds while saving", () => {
    deepStrictEqual(buttons(paid({ selected: "" })), [
      ["Pick an organization", true],
      ["Back", false],
    ]);
    deepStrictEqual(buttons(paid({ busy: true })), [
      ["Use it for La Fila", true],
      ["Back", true],
    ]);
    deepStrictEqual(buttons(free({ busy: true })), [
      ["Keep La Fila on the free tier", true],
    ]);
  });

  it("drops Back on the first page of a flow", () => {
    deepStrictEqual(buttons(paid({ onBack: undefined, progress: null })), [
      ["Use it for La Fila", false],
    ]);
  });

  it("gives an org the same avatar tone wherever it shows", () => {
    const tones = (page: Document) =>
      [...page.querySelectorAll("[data-tone]")].map((avatar) =>
        avatar.getAttribute("data-tone"),
      );
    deepStrictEqual(tones(free()), ["crimson", "orange", "teal"]);
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
        title: "La Fila stays on the free tier",
        lines: [
          "Here's how your organizations look from Friday, October 23.",
          "You can change this in Settings.",
        ],
        orgs: [
          ["La Fila", "Free tier"],
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
        ["Personal", "Free tier"],
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
        ["La Fila", "Nivel gratuito"],
        ["Innova", "Tu suscripción"],
        ["Personal", "Necesita un plan"],
      ]);
    } finally {
      await i18next.changeLanguage("en");
    }
  });
});

/** The intro the modal opens on: its date chip, points and actions. */
function introText(
  choice: BillingChoice,
  page: "notice" | "not_kept" = "notice",
  listPrices: SeatPrices | null = LIST_PRICES,
) {
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
  const rendered = doc(
    h(
      Dialog,
      { open: true },
      h(intro.BillingChangeIntro, {
        notice,
        choice,
        listPrices,
        page,
        progress: null,
        onNext: noop,
        onBack: noop,
        onClose: noop,
      }),
    ),
  );
  return {
    head: [...rendered.querySelectorAll(":scope body > p, h2")].map(
      (line) => line.textContent,
    ),
    points: [...rendered.querySelectorAll("li")].map((point) =>
      [...point.querySelectorAll("p")].map((line) => line.textContent),
    ),
    buttons: [...rendered.querySelectorAll("button")].map((b) => b.textContent),
  };
}

const LIST_PRICES: SeatPrices = { monthlyCents: 2000, annualCents: 18000 };

const HEAD = [
  "From Friday, October 23",
  "Teams are out of beta",
  "Thanks for helping us shape how teams work in Houston.",
];
const TEAM_ANY = [
  "Every space works like a team",
  "Personal and team spaces become the same thing, so you can invite people to any of them.",
];

const SINGLE = {
  ...CHOICE,
  needed: false,
  payer: null,
  orgs: [{ ...CHOICE.orgs[2] }],
};

const PICK_HEAD = ["From Friday, October 23", "Teams are out of beta"];
const ONE_FREE_ALL = [
  "Each account gets one organization on the free tier",
  "Everyone in it shares the free tier's weekly limit.",
];

describe("the announcement", () => {
  it("tells an owner what changes, the price per member, then Next", () => {
    deepStrictEqual(introText({ ...CHOICE, payer: null }), {
      head: PICK_HEAD,
      points: [
        [
          "Every space works like a team",
          "You can invite people to any of them.",
        ],
        ONE_FREE_ALL,
        [
          "The rest are $20 per member a month, or $15 a month billed yearly",
          "Only for organizations you want to keep working.",
        ],
      ],
      buttons: ["Next", "Maybe later"],
    });
  });

  it("prices the rest off the wire: monthly only, or unsaid while unknown", () => {
    const owner = { ...CHOICE, payer: null };
    const monthly = introText(owner, "notice", {
      monthlyCents: 2000,
      annualCents: null,
    });
    ok(monthly !== "closed");
    deepStrictEqual(monthly.points[2], [
      "The rest are $20 per member a month",
      "Only for organizations you want to keep working.",
    ]);
    const unknown = introText(owner, "notice", null);
    ok(unknown !== "closed");
    deepStrictEqual(unknown.points[2], [
      "The rest need the paid tier",
      "Only for organizations you want to keep working.",
    ]);
  });

  it("tells a payer the subscription covers one org they choose next", () => {
    const shown = introText(CHOICE);
    ok(shown !== "closed");
    deepStrictEqual(shown.points[2], [
      "Your subscription covers one organization",
      "$15 per member a month. You pick it in a moment.",
    ]);
  });

  it("names no price inside a store app, which never sells", () => {
    const leave = enterNativeApp();
    try {
      const owner = introText({ ...CHOICE, payer: null });
      ok(owner !== "closed");
      deepStrictEqual(owner.points[2], [
        "The rest need the paid tier",
        "Only for organizations you want to keep working.",
      ]);
      const payer = introText(CHOICE);
      ok(payer !== "closed");
      deepStrictEqual(payer.points[2][1], "You pick it in a moment.");
    } finally {
      leave();
    }
  });

  it("leaves a payer's price unsaid when no org carries a total", () => {
    const orgs = CHOICE.orgs.map((one) => ({
      ...one,
      monthlyTotalCents: null,
    }));
    const shown = introText({ ...CHOICE, orgs });
    ok(shown !== "closed");
    deepStrictEqual(shown.points[2], [
      "Your subscription covers one organization",
      "You pick it in a moment.",
    ]);
  });

  it("says what happens to the orgs not kept free, with Back", () => {
    const owner = introText({ ...CHOICE, payer: null }, "not_kept");
    deepStrictEqual(owner, {
      head: ["Organizations not on the free tier", "Nothing gets deleted"],
      points: [
        [
          "You can still open them",
          "Every agent, mission and file stays where it is.",
        ],
        [
          "Move agents to your organization on the free tier",
          "Bring the ones you want to keep using.",
        ],
        [
          "New conversations wait for a plan",
          "When you open one, you can pay for it there.",
        ],
      ],
      buttons: ["Choose my organization for the free tier", "Back"],
    });
    const payer = introText(CHOICE, "not_kept");
    ok(payer !== "closed");
    deepStrictEqual(payer.buttons, ["Next", "Back"]);
  });

  it("names the one org that stays free, or that the subscription pays for", () => {
    const named = [
      "Every space works like a team",
      "Personal and team spaces become the same thing, so you can invite people to La Fila.",
    ];
    const nothing = "Nothing to do. It keeps working the way it does today.";
    deepStrictEqual(introText(SINGLE), {
      head: HEAD,
      points: [named, ["La Fila stays on the free tier", nothing]],
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
      ]);
      deepStrictEqual(shown.points[2], [
        "Las demás cuestan 20\u00a0US$ por miembro al mes, o 15\u00a0US$ al mes facturado una vez al año",
        "Solo para las organizaciones que quieras que sigan funcionando.",
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
