import { deepStrictEqual } from "node:assert/strict";
import { before, describe, it } from "node:test";
import type {
  EmployeeNameIssueCopy,
  EmployeeNameIssueCopyOptions,
} from "../src/components/employee-card/use-employee-name.ts";
import agents from "../src/locales/en/agents.json" with { type: "json" };
import shell from "../src/locales/en/shell.json" with { type: "json" };

let render: (options?: EmployeeNameIssueCopyOptions) => EmployeeNameIssueCopy;

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["agents", "shell"],
    resources: { en: { agents, shell } },
  });
  const { useEmployeeNameIssueCopy } = await import(
    "../src/components/employee-card/use-employee-name.ts"
  );
  render = (options) => {
    let copy: EmployeeNameIssueCopy | undefined;
    const Probe = () => {
      copy = useEmployeeNameIssueCopy(options);
      return null;
    };
    renderToStaticMarkup(React.createElement(Probe));
    if (!copy) throw new Error("the hook never rendered");
    return copy;
  };
});

describe("useEmployeeNameIssueCopy", () => {
  it("names every issue in the shared copy", () => {
    const copy = render();
    deepStrictEqual(
      [
        copy(null, "Ava"),
        copy("required", ""),
        copy("invalidChars", "a/b"),
        copy("reserved", "Houston"),
        copy("taken", "  Ava "),
      ],
      [
        null,
        shell.employeeCard.nameRequired,
        agents.nameErrors.invalidChars,
        agents.nameErrors.reserved,
        agents.toasts.nameConflict.replace("{{name}}", "Ava"),
      ],
    );
  });

  it("uses a flow's own taken copy, with the trimmed name, and nothing else", () => {
    const seen: string[] = [];
    const copy = render({
      taken: (name) => {
        seen.push(name);
        return `copy of ${name} exists`;
      },
    });
    deepStrictEqual(copy("taken", "  Ava "), "copy of Ava exists");
    deepStrictEqual(seen, ["Ava"]);
    deepStrictEqual(copy("reserved", "Houston"), agents.nameErrors.reserved);
    deepStrictEqual(copy(null, "Ava"), null);
  });
});
