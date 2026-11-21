import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import agents from "../src/locales/en/agents.json" with { type: "json" };
import common from "../src/locales/en/common.json" with { type: "json" };
import "./support/dom-env.ts";

const g = globalThis as unknown as Record<string, unknown>;
const win = g.window as Window & typeof globalThis;
for (const key of ["HTMLTextAreaElement", "MouseEvent", "getComputedStyle"])
  g[key] = (win as unknown as Record<string, unknown>)[key];

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const i18next = (await import("i18next")).default;
const { initReactI18next } = await import("react-i18next");
await i18next.use(initReactI18next).init({
  lng: "en",
  ns: ["agents", "common"],
  react: { useSuspense: false },
  resources: { en: { agents, common } },
});
const { LearningsContent } = await import(
  "../src/components/agent/learnings-content.tsx"
);

function pendingWrite() {
  let settle: (landed: boolean) => void = () => {};
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function button(name: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find(
    (b) =>
      b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`no button named ${name}`);
  return found;
}

const textarea = () => document.body.querySelector("textarea");

async function click(name: string) {
  await act(async () => {
    button(name).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
}

async function type(text: string) {
  const el = textarea();
  if (!el) throw new Error("no editor open");
  const setValue = Object.getOwnPropertyDescriptor(
    win.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setValue?.call(el, text);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

async function mount(props: Parameters<typeof LearningsContent>[0]) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(h(LearningsContent, props)));
  return root;
}

const edit = agents.learnings.editAria;
const save = common.actions.save;

describe("a refused Memory write keeps the typed text", () => {
  it("a refused add closes at once, then reopens its draft with the text", async () => {
    const write = pendingWrite();
    const added: string[] = [];
    const root = await mount({
      entries: [],
      onAdd: (text) => {
        added.push(text);
        return write.promise;
      },
      onRemove: () => {},
      onUpdate: async () => true,
    });
    await click(agents.learnings.addLearning);
    await type("Always cc Ana");
    await click(save);
    assert.deepEqual(added, ["Always cc Ana"]);
    assert.equal(textarea(), null, "the draft closes on the commit");
    await act(async () => write.settle(false));
    assert.equal(textarea()?.value, "Always cc Ana");
    await act(async () => root.unmount());
  });

  it("a landed add leaves no draft behind", async () => {
    const root = await mount({
      entries: [],
      onAdd: async () => true,
      onRemove: () => {},
      onUpdate: async () => true,
    });
    await click(agents.learnings.addLearning);
    await type("Ship on Fridays");
    await click(save);
    assert.equal(textarea(), null);
    await act(async () => root.unmount());
  });

  it("a refused edit reopens holding the edit, not the rolled-back text", async () => {
    const write = pendingWrite();
    const entry = { index: 0, id: "l1", text: "Old rule" };
    const props = {
      entries: [entry],
      onAdd: async () => true,
      onRemove: () => {},
      onUpdate: () => write.promise,
    };
    const root = await mount(props);
    await click(edit);
    await type("New rule");
    await click(save);
    assert.equal(textarea(), null, "the editor closes on the commit");
    await act(async () =>
      root.render(
        h(LearningsContent, {
          ...props,
          entries: [{ ...entry, text: "New rule" }],
        }),
      ),
    );
    await act(async () => root.render(h(LearningsContent, props)));
    await act(async () => write.settle(false));
    assert.equal(textarea()?.value, "New rule");
    await act(async () => root.unmount());
  });
});

describe("removing a learning that is already gone", () => {
  it("is a success, not a second failure", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../src/data/learnings.ts"),
      "utf8",
    );
    const remove = src.slice(src.indexOf("export function remove("));
    assert.match(remove, /if \(next\.length === items\.length\) return;/);
    assert.doesNotMatch(remove, /Learning not found/);
  });
});
