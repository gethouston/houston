import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { createLanguageChange } from "../src/components/settings/sections/language-change.ts";
import type { SupportedLocale } from "../src/lib/i18n.ts";
import type { Workspace } from "../src/lib/types.ts";
import { workspaceLocaleWrites } from "../src/stores/workspace-locale-writes.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ws = (locale: string | null): Workspace =>
  ({ id: "w", name: "Team", locale }) as Workspace;

function harness(initial: string | null) {
  let row = ws(initial);
  const answers: Array<ReturnType<typeof deferred<Workspace>>> = [];
  const setLocale = workspaceLocaleWrites({
    read: () => row.locale,
    swap: (_id, next) => {
      row = next(row);
    },
    write: () => {
      const answer = deferred<Workspace>();
      answers.push(answer);
      return answer.promise;
    },
  });
  return { setLocale, answers, locale: () => row.locale };
}

describe("workspaceLocaleWrites", () => {
  it("an older refusal never rolls back a newer pick that saved", async () => {
    const { setLocale, answers, locale } = harness("en");
    const first = setLocale("w", "es");
    const second = setLocale("w", "pt");
    answers[1]?.resolve(ws("pt"));
    strictEqual(await second, "saved");
    answers[0]?.reject(new Error("boom"));
    strictEqual(await first, "superseded");
    strictEqual(locale(), "pt");
  });

  it("an older success never swaps over a newer pick", async () => {
    const { setLocale, answers, locale } = harness("en");
    const first = setLocale("w", "es");
    const second = setLocale("w", "pt");
    answers[0]?.resolve(ws("es"));
    strictEqual(await first, "superseded");
    strictEqual(locale(), "pt");
    answers[1]?.resolve(ws("pt"));
    await second;
    strictEqual(locale(), "pt");
  });

  it("the newest refusal rolls back to what the host last kept", async () => {
    const { setLocale, answers, locale } = harness("en");
    const first = setLocale("w", "es");
    const second = setLocale("w", "pt");
    answers[0]?.resolve(ws("es"));
    await first;
    answers[1]?.reject(new Error("boom"));
    await rejects(second, /boom/);
    strictEqual(locale(), "es");
  });

  it("an older save landing after the newest refusal is the truth", async () => {
    const { setLocale, answers, locale } = harness("en");
    const first = setLocale("w", "es");
    const second = setLocale("w", "pt");
    answers[1]?.reject(new Error("boom"));
    await rejects(second, /boom/);
    strictEqual(locale(), "en");
    answers[0]?.resolve(ws("es"));
    await first;
    strictEqual(locale(), "es");
  });
});

describe("createLanguageChange", () => {
  function picker(restored: SupportedLocale | null) {
    let shown: SupportedLocale = "en";
    const saves: Array<ReturnType<typeof deferred<"saved" | "superseded">>> =
      [];
    const refused: unknown[] = [];
    const change = createLanguageChange({
      shown: () => shown,
      show: async (locale) => {
        shown = locale;
      },
      announce: () => {},
      save: () => {
        const save = deferred<"saved" | "superseded">();
        saves.push(save);
        return save.promise;
      },
      restored: () => restored,
      refused: (err) => refused.push(err),
    });
    return { change, saves, refused, shown: () => shown };
  }

  it("a superseded pick leaves the newer language on screen", async () => {
    const p = picker(null);
    const first = p.change("w", "es");
    const second = p.change("w", "pt");
    p.saves[0]?.resolve("superseded");
    p.saves[1]?.resolve("saved");
    await Promise.all([first, second]);
    strictEqual(p.shown(), "pt");
    deepStrictEqual(p.refused, []);
  });

  it("the newest refusal shows the language from before the run of picks", async () => {
    const p = picker(null);
    const first = p.change("w", "es");
    const second = p.change("w", "pt");
    p.saves[0]?.resolve("superseded");
    p.saves[1]?.reject(new Error("boom"));
    await Promise.all([first, second]);
    strictEqual(p.shown(), "en");
    strictEqual(p.refused.length, 1);
  });

  it("a refusal shows the workspace's restored choice when it has one", async () => {
    const p = picker("es");
    const done = p.change("w", "pt");
    p.saves[0]?.reject(new Error("boom"));
    await done;
    strictEqual(p.shown(), "es");
  });
});
