import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  carouselIndex,
  employeeStatusView,
  paletteColumns,
  paletteKeyStep,
} from "../src/components/employee-card/employee-card-model.ts";
import {
  EMPLOYEE_NAME_SUGGESTIONS,
  nameSuggestionLocale,
  roleSuggestionOffset,
  suggestEmployeeName,
} from "../src/components/employee-card/employee-name-suggestions.ts";
import {
  employeeNameIssue,
  firstNameIssueIndex,
  visibleNameIssue,
} from "../src/components/employee-card/employee-name-validation.ts";

const suggest = (role: string, current: string, taken: string[] = []) =>
  suggestEmployeeName({ locale: "en", role, current, taken });

describe("employee name suggestions", () => {
  it("offers several friendly names in every app language", () => {
    for (const locale of ["en", "es", "pt"] as const) {
      const names = EMPLOYEE_NAME_SUGGESTIONS[locale];
      strictEqual(names.length >= 10, true, locale);
      strictEqual(new Set(names).size, names.length, `${locale} repeats`);
    }
  });

  it("reads the list from the app language, falling back to English", () => {
    strictEqual(nameSuggestionLocale("es-MX"), "es");
    strictEqual(nameSuggestionLocale("pt-BR"), "pt");
    strictEqual(nameSuggestionLocale("en"), "en");
    strictEqual(nameSuggestionLocale("fr"), "en");
  });

  it("opens each job on its own name, the same every time", () => {
    const first = suggest("Executive assistant", "");
    strictEqual(first, suggest("Executive assistant", ""));
    const names = EMPLOYEE_NAME_SUGGESTIONS.en;
    strictEqual(
      first,
      names[roleSuggestionOffset("Executive assistant", names.length)],
    );
    const openers = new Set(
      ["Executive assistant", "Operations manager", "Finance manager"].map(
        (role) => suggest(role, ""),
      ),
    );
    strictEqual(openers.size, 3);
  });

  it("moves one name on per press, around the whole list", () => {
    const names = EMPLOYEE_NAME_SUGGESTIONS.en;
    const role = "Finance manager";
    const seen: string[] = [];
    let current = "";
    for (let press = 0; press < names.length; press += 1) {
      current = suggest(role, current);
      seen.push(current);
    }
    deepStrictEqual(new Set(seen).size, names.length);
    strictEqual(suggest(role, current), seen[0]);
    // A typed name that is not in the list starts back at the job's opener.
    strictEqual(suggest(role, "Bartholomew"), seen[0]);
  });

  it("steps over names already taken, ignoring case", () => {
    const role = "Executive assistant";
    const opener = suggest(role, "");
    const next = suggest(role, "", [opener.toUpperCase()]);
    notStrictEqual(next, opener);
    strictEqual(next, suggest(role, opener));
  });

  it("numbers a name once every suggestion is taken", () => {
    const names = [...EMPLOYEE_NAME_SUGGESTIONS.en];
    const name = suggest("Writer", "", names);
    strictEqual(/ 2$/.test(name), true, name);
    strictEqual(
      names.some((n) => name.startsWith(n)),
      true,
    );
  });
});

describe("employee name validation", () => {
  it("requires a name", () => {
    strictEqual(employeeNameIssue("", []), "required");
    strictEqual(employeeNameIssue("   ", []), "required");
    strictEqual(employeeNameIssue("Ava", []), null);
  });

  it("keeps the host's own rules", () => {
    strictEqual(employeeNameIssue("Ava", ["ava"]), "taken");
    strictEqual(employeeNameIssue("a/b", []), "invalidChars");
  });

  it("waits for a submit before calling a blank name out", () => {
    strictEqual(visibleNameIssue("required", false), null);
    strictEqual(visibleNameIssue("required", true), "required");
    strictEqual(visibleNameIssue("taken", false), "taken");
    strictEqual(visibleNameIssue(null, true), null);
  });

  it("finds the first card to fix", () => {
    strictEqual(firstNameIssueIndex([null, null]), null);
    strictEqual(firstNameIssueIndex([null, "required", "taken"]), 1);
  });
});

describe("employee card status", () => {
  it("omits the draft status and marks progress on the foot", () => {
    deepStrictEqual(employeeStatusView("draft"), {
      mark: null,
      dimPortrait: false,
      offersActions: false,
    });
    deepStrictEqual(employeeStatusView("joining"), {
      mark: "spinner",
      dimPortrait: true,
      offersActions: false,
    });
    strictEqual(employeeStatusView("hired").mark, "successDot");
    deepStrictEqual(employeeStatusView("failed"), {
      mark: "alert",
      dimPortrait: false,
      offersActions: true,
    });
  });
});

describe("employee card carousel", () => {
  it("shows the slide whose start is nearest", () => {
    strictEqual(carouselIndex(0, 260, 3), 0);
    strictEqual(carouselIndex(120, 260, 3), 0);
    strictEqual(carouselIndex(140, 260, 3), 1);
    strictEqual(carouselIndex(520, 260, 3), 2);
  });

  it("clamps overscroll and an unmeasured stride", () => {
    strictEqual(carouselIndex(-40, 260, 3), 0);
    strictEqual(carouselIndex(9999, 260, 3), 2);
    strictEqual(carouselIndex(100, 0, 3), 0);
    strictEqual(carouselIndex(100, 260, 0), 0);
  });
});

describe("employee color palette keys", () => {
  it("reads the columns from the rows the swatches lay out in", () => {
    strictEqual(paletteColumns([0, 0, 0, 0, 0, 28, 28, 28, 28, 28]), 5);
    strictEqual(paletteColumns([0, 0, 0, 0, 24, 24, 24, 24, 48, 48]), 4);
    strictEqual(paletteColumns([0, 0, 0]), 3);
    strictEqual(paletteColumns([]), 0);
  });

  it("walks the row, jumps a row, and wraps around the ten", () => {
    strictEqual(paletteKeyStep("ArrowRight", 0, 10, 5), 1);
    strictEqual(paletteKeyStep("ArrowLeft", 0, 10, 5), 9);
    strictEqual(paletteKeyStep("ArrowDown", 2, 10, 5), 7);
    strictEqual(paletteKeyStep("ArrowUp", 2, 10, 5), 7);
    strictEqual(paletteKeyStep("ArrowDown", 2, 10, 4), 6);
    strictEqual(paletteKeyStep("ArrowUp", 1, 10, 4), 7);
    strictEqual(paletteKeyStep("ArrowRight", 9, 10, 5), 0);
    strictEqual(paletteKeyStep("Home", 6, 10, 5), 0);
    strictEqual(paletteKeyStep("End", 1, 10, 5), 9);
    strictEqual(paletteKeyStep("Enter", 1, 10, 5), null);
    strictEqual(paletteKeyStep("Escape", 1, 10, 5), null);
    strictEqual(paletteKeyStep("Tab", 1, 10, 5), null);
  });
});
