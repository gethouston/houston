import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminViewEnabled } from "../src/components/shell/top-level-screen-plan.ts";
import {
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
} from "../src/lib/settings-sections.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("settings-view source", () => {
  const src = read("../src/components/settings/settings-view.tsx");

  it("keeps Admin out of the Settings index", () => {
    const sections = new Set<string>(SETTINGS_SECTION_IDS);
    ok(!sections.has("admin"));
    ok(!sections.has("organization"));
    ok(!sections.has("workspace"));
  });

  it("puts every section behind the ONE workspace gate", () => {
    ok(
      !src.includes("settingsSectionNeedsWorkspace"),
      "no per-section workspace opt-out",
    );
    ok(src.includes('if (gate === "loading")'), "one workspace spinner");
    ok(src.includes('if (gate !== "ready")'), "one workspace error frame");
  });

  it("emits one truthful tab_opened per surface reached", () => {
    ok(src.includes('? "settings"'), "the index is keyed `settings`");
    ok(src.includes("`settings:"), "a section is keyed `settings:<id>`");
    ok(
      src.includes("lastReached.current === reached") &&
        src.includes("lastReached.current = reached"),
      "emits once per open, not once per render",
    );
    ok(
      /const reached =\s*gate !== "ready"\s*\? null/.test(src),
      "a loading or error frame emits nothing",
    );
  });

  it("matches the sections' scroll gutter on the index scroller", () => {
    ok(
      src.includes(
        'className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"',
      ),
      "index scroller reserves the scrollbar gutter",
    );
    ok(
      read("../src/components/shell/back-bar-screen.tsx").includes(
        "[scrollbar-gutter:stable]",
      ),
      "the section frame it must match still reserves it",
    );
  });
});

describe("Settings without the person", () => {
  const index = read("../src/components/settings/settings-index.tsx");
  const body = read("../src/components/settings/settings-section-body.tsx");

  it("draws no identity header and no Sign out", () => {
    ok(!index.includes("SettingsIdentityHeader"), "no identity header");
    ok(!index.includes("signOut"), "no way out from Settings");
  });

  it("lists neither Profile nor About me", () => {
    ok(!index.includes("profileAvailable"), "no Profile gate to read");
    ok(!index.includes('onSelect("profile")'), "no Profile row");
    ok(!index.includes('onSelect("aboutMe")'), "no About me row");
    ok(!body.includes("ProfileView"), "no Profile branch");
    ok(!body.includes("AboutMeView"), "no About me branch");
  });
});

describe("the About me screen", () => {
  const src = read("../src/components/account/about-me-view.tsx");

  it("reuses the ONE standing-prose editor over the `user` slot", () => {
    ok(src.includes('useContextSlot("user")'), "the user slot");
    ok(src.includes("<ContextEditorBox"), "the shared editor, not a new one");
    ok(src.includes('t("aboutMe.title")'), "the copy it already owned");
  });

  it("draws the COMPACT card, because the page column scrolls", () => {
    ok(src.includes("layout={{ rows: 14 }}"), "rows mode");
    ok(!src.includes('layout="fill"'), "never the pinned page layout");
    ok(src.includes("<AccountPage"), "the account pages' frame");
  });
});

describe("Settings > API keys", () => {
  const index = read("../src/components/settings/settings-index.tsx");
  const body = read("../src/components/settings/settings-section-body.tsx");

  it("draws the row behind the public-API gate", () => {
    ok(index.includes('settingsSectionAvailable("apiKeys", capabilities)'));
    ok(index.includes('onSelect("apiKeys")'));
  });

  it("mounts the section behind the same gate", () => {
    ok(body.includes('settingsSectionAvailable("apiKeys", capabilities)'));
    ok(body.includes("<ApiKeysSection />"));
  });

  it("gives every AI Employee's Settings an API access screen", () => {
    const manage = read(
      "../src/components/agent-settings/agent-settings-manage.tsx",
    );
    const card = read("../src/components/agent-settings/agent-api-access.tsx");
    ok(manage.includes("apiKeysSupported(useCapabilities().capabilities)"));
    ok(manage.includes("apiAvailable && apiFor === agent.id"));
    ok(manage.includes("<AgentApiAccess agent={agent} onBack="));
    ok(card.includes('openSettings("apiKeys")'));
  });

  it("shows the open organization's ID, the one value no key can look up", () => {
    const section = read("../src/components/settings/sections/api-keys.tsx");
    const spaceId = read("../src/components/settings/sections/api-org-id.tsx");
    ok(section.includes("<ApiOrgId />"));
    ok(spaceId.includes("connectOrgSlug(workspace?.id, orgs)"));
  });
});

describe("the Admin screen", () => {
  it("keeps Admin mounted pending its gate, then admits or removes it", () => {
    strictEqual(
      adminViewEnabled({ showOrganization: false, ready: false }),
      true,
    );
    strictEqual(
      adminViewEnabled({ showOrganization: false, ready: true }),
      false,
    );
    strictEqual(
      adminViewEnabled({ showOrganization: true, ready: true }),
      true,
    );
  });

  it("has no Settings section", () => {
    strictEqual(parseSettingsSection("workspace"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("admin"), null);
  });
});

describe("Settings after the Skills library left", () => {
  it("draws no Skills row and mounts no library", () => {
    const index = read("../src/components/settings/settings-index.tsx");
    ok(!index.includes("showSkills"), "no gate to read");
    ok(!index.includes('onSelect("skills")'), "no row to open it");
    ok(!index.includes("settings:nav.skills"), "no name for it");
    const body = read("../src/components/settings/settings-section-body.tsx");
    ok(!body.includes('active === "skills"'), "no section branch");
    ok(!body.includes("skills-view"), "and nothing imported from the library");
  });
});

describe("workspace-shell analytics", () => {
  const src = read("../src/components/shell/use-workspace-view-guards.ts");

  it("leaves the settings tab_opened event to SettingsView", () => {
    ok(
      src.includes('if (viewMode === "settings") return;'),
      "the generic viewMode effect skips settings",
    );
  });

  it("treats a stale top-level Admin id like any other dead view", () => {
    ok(
      !src.includes('viewMode === "organization"'),
      "organization has no top-level analytics branch",
    );
  });
});

describe("use-surface-gates", () => {
  const src = read("../src/hooks/use-surface-gates.ts");

  it("composes every gate through the pure model", () => {
    ok(src.includes("surfaceGatesFor({"), "calls the model");
    ok(
      src.includes("capabilitiesLoading: isLoading"),
      "hands it the query state `ready` is derived from",
    );
  });
});
