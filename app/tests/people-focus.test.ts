import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import "./support/dom-env.ts";

const React = await import("react");
const { act, createElement: h } = React;
Object.assign(globalThis, { React });
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const i18next = (await import("i18next")).default;
const { initReactI18next } = await import("react-i18next");
const teams = (
  await import("../src/locales/en/teams.json", { with: { type: "json" } })
).default;
const { useOrgNav } = await import(
  "../src/components/organization/org-nav-store.ts"
);
const { usePersonFocus } = await import(
  "../src/components/organization/use-person-focus.ts"
);
const { PeopleRosterRow } = await import(
  "../src/components/organization/people-roster-row.tsx"
);

await i18next.use(initReactI18next).init({
  lng: "en",
  ns: ["teams"],
  defaultNS: "teams",
  resources: { en: { teams } },
});

const INITIAL = useOrgNav.getInitialState();
beforeEach(() => useOrgNav.setState(INITIAL, true));

describe("opening People on a person", () => {
  it("pins the People section and the person together", () => {
    useOrgNav.getState().requestPerson("tom");
    assert.equal(useOrgNav.getState().requestedTab, "people");
    assert.equal(useOrgNav.getState().focusedPerson, "tom");
  });

  it("scrolls that person's row into view and lets the focus go on leaving", async () => {
    const scrolled: string[] = [];
    const proto = globalThis.HTMLElement.prototype as unknown as {
      scrollIntoView: (this: HTMLElement) => void;
    };
    proto.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.person ?? "");
    };
    let seen: string | null = null;
    function Roster() {
      const { focused, listRef } = usePersonFocus();
      seen = focused;
      return h(
        "ul",
        { ref: listRef },
        ["ana", "tom"].map((id) => h("li", { key: id, "data-person": id })),
      );
    }
    useOrgNav.getState().requestPerson("tom");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(Roster)));
    assert.equal(seen, "tom");
    assert.deepEqual(scrolled, ["tom"]);
    assert.equal(useOrgNav.getState().focusedPerson, "tom");
    await act(async () => root.unmount());
    assert.equal(useOrgNav.getState().focusedPerson, null);
    host.remove();
  });

  it("marks the focused row as the current one", () => {
    const row = (focused: boolean) =>
      renderToStaticMarkup(
        h(PeopleRosterRow, {
          member: { userId: "tom", role: "user", displayName: "Tom Reed" },
          isSelf: false,
          editable: false,
          focused,
          busy: { role: false, remove: false },
          onRole: () => {},
          onRemove: () => {},
        }),
      );
    assert.match(row(true), /<li[^>]*aria-current="true"/);
    assert.match(row(true), /data-person="tom"/);
    assert.doesNotMatch(row(false), /aria-current/);
  });
});
