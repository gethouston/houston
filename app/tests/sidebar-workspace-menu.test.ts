import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const ROWS = read("../src/components/shell/sidebar-nav-rows.tsx");
const GROUP = read("../src/components/shell/connect-group.tsx");
const FOOTER = read("../src/components/shell/sidebar-footer.tsx");
const ACCOUNT_MENU = read("../src/components/shell/sidebar-account-menu.tsx");
const MENU = read("../src/components/shell/sidebar-workspace-menu.tsx");
const ACCOUNT = read("../src/components/shell/workspace-account.tsx");
const FACE = read("../src/components/shell/workspace-switcher-face.tsx");
const RAIL = read("../src/components/shell/sidebar-rail.tsx");
const SHELL = read("../src/components/shell/workspace-shell.tsx");
const MORE_MENU = read("../src/components/shell/mobile-more-menu.tsx");
const MORE_ROW = read("../src/components/shell/mobile-more-row.tsx");

function at(source: string, needle: string): number {
  const index = source.indexOf(needle);
  assert.ok(index >= 0, `renders ${needle}`);
  return index;
}

function inOrder(source: string, needles: string[]) {
  const order = needles.map((needle) => at(source, needle));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
}

it("makes the shell card gap a drag region only for the native Mac window", () => {
  assert.match(
    SHELL,
    /data-tauri-drag-region=\{osIsTauri\(\) && isMac \? true : undefined\}\s+className="relative flex min-w-0 flex-1 gap-0 overflow-hidden md:gap-2"/,
  );
});

describe("the rail, top to bottom", () => {
  it("is search and create, invites, the list, its shortcut, the foot", () => {
    inOrder(RAIL, [
      "headerActions={",
      "headerBelow={",
      "listFooter={",
      "footer={",
    ]);
    assert.ok(!RAIL.includes("listHeading"));
    assert.ok(!RAIL.includes("topNav"));
  });

  it("ends on the update notice, the connect rows, then the account row", () => {
    inOrder(FOOTER, [
      "<UpdateChecker collapsed={props.collapsed} />",
      "<ConnectGroup",
      "<SidebarWorkspaceMenu",
    ]);
  });
});

describe("the account row", () => {
  it("is the person over their workspace, like an employee row", () => {
    assert.ok(MENU.includes("<SidebarProfileMenu"));
    assert.ok(MENU.includes("title={profile?.name ?? workspaceName}"));
    assert.ok(MENU.includes("subtitle={profile ? workspaceName : undefined}"));
    assert.ok(MENU.includes('dataAttrs={tourAnchor("workspaceMenu")}'));
  });

  it("opens one menu: who, workspaces, the person, destinations, Sign out", () => {
    inOrder(MENU, [
      "{account.header}",
      "<WorkspaceSwitchItems",
      "{account.personal}",
      "{destinations.map((row) => (",
      "{account.signOut}",
    ]);
    inOrder(MENU, ["adminNavRow({", "academyNavRow({", "settingsNavRow({"]);
    assert.ok(MENU.includes("...(showOrganization"));
  });

  it("opens Settings on its INDEX and Admin through openAdmin", () => {
    assert.ok(MENU.includes("onOpen: () => openSettings(null)"));
    assert.ok(MENU.includes("onOpen: () => openAdmin()"));
  });
});

describe("the account menu", () => {
  it("is headed by the person's name and email", () => {
    assert.ok(ACCOUNT_MENU.includes("<DropdownMenuLabel"));
    assert.match(
      ACCOUNT_MENU,
      /<SignedInHeader\s+name=\{profile\.name\}\s+email=\{session\?\.email \?\? ""\}/,
    );
    assert.ok(FACE.includes("export function SignedInHeader("));
  });

  it("holds Profile, About me and Sign out, nothing else", () => {
    inOrder(ACCOUNT_MENU, [
      "open(PROFILE_VIEW_ID)",
      "open(ABOUT_ME_VIEW_ID)",
      'label: t("accountMenu.signOut")',
    ]);
    assert.equal(ACCOUNT_MENU.match(/<MenuItemRow/g)?.length, 3);
    inOrder(ACCOUNT_MENU, [
      "...(profileAvailable ? [profileAction] : [])",
      "aboutMeAction,",
      "...(profile ? [signOutAction] : [])",
    ]);
    assert.ok(
      ACCOUNT_MENU.includes(
        "{profileAvailable && <MenuItemRow {...profileAction} />}",
      ),
    );
    assert.ok(
      ACCOUNT_MENU.includes('logAndReportError("account-sign-out", e)'),
    );
  });

  it("opens Profile and About me as screens of their own, not Settings", () => {
    assert.ok(ACCOUNT_MENU.includes("setViewMode(view, { nav: opts.nav });"));
    assert.ok(!ACCOUNT_MENU.includes("openSettings"));
  });

  it("is the same menu on both breakpoints", () => {
    assert.ok(MENU.includes("useAccountMenu({ onNavigate: closeMobileMenu })"));
    assert.ok(
      MORE_MENU.includes('useAccountMenu({ nav: "reset", onNavigate: close })'),
    );
    assert.ok(MORE_ROW.includes("export function MobileAccountRow("));
  });
});

describe("the workspace switcher", () => {
  it("heads the phone's card: the workspace's name alone, no letter tile", () => {
    assert.ok(
      FACE.includes(
        'const title = current?.name ?? t("sidebar.selectWorkspace");',
      ),
    );
    assert.ok(!FACE.includes("WorkspaceMark"));
    assert.ok(MORE_MENU.includes("useWorkspaceSwitcherFace()"));
    assert.ok(MORE_MENU.includes("<SidebarWorkspaceSwitcher"));
    assert.ok(MORE_MENU.includes("header={face.header}"));
    assert.ok(!MENU.includes("SidebarWorkspaceSwitcher"));
    assert.ok(
      MORE_MENU.includes(
        'dataAttrs={{ "data-testid": "more-workspace-switcher" }}',
      ),
    );
  });

  it("marks the current workspace with a leading check, no letter tiles in the list", () => {
    assert.ok(!ACCOUNT.includes("WorkspaceMark"));
    assert.ok(ACCOUNT.includes("<DropdownMenuCheckboxItem"));
    assert.ok(ACCOUNT.includes("checked={workspace.id === currentId}"));
    assert.ok(MORE_MENU.includes("<WorkspaceSwitchItems"));
  });

  it("creates an organization where Spaces are served, a workspace elsewhere", () => {
    assert.ok(
      ACCOUNT.includes("const spacesEnabled = hasSpaces(capabilities)"),
    );
    assert.ok(ACCOUNT.includes("<CreateOrganizationDialog"));
    assert.ok(
      ACCOUNT.includes(
        "onCreate: spacesEnabled ? () => setOpen(true) : onCreateLocal",
      ),
    );
    for (const host of [MENU, MORE_MENU]) {
      assert.ok(host.includes("useWorkspaceCreate("));
      assert.ok(host.includes("{create.dialog}"));
    }
  });

  it("runs every item one tick AFTER the menu closes", () => {
    assert.ok(ACCOUNT.includes("return () => setTimeout(run, 0);"));
    assert.ok(ACCOUNT.includes("onSelect={afterClose(props.onSelect)}"));
  });
});

describe("the connect group", () => {
  it("opens Integrations and AI Models under the rail's own anchors", () => {
    assert.ok(GROUP.includes('dataAttrs: tourAnchor("nav-integrations")'));
    assert.ok(GROUP.includes('dataAttrs: tourAnchor("nav-ai-hub")'));
    assert.ok(GROUP.includes("onClick: () => open(INTEGRATIONS_VIEW_ID)"));
    assert.ok(GROUP.includes("onClick: () => open(AI_HUB_VIEW_ID)"));
  });

  it("leads each row with its label, no glyph: the logos say what it is", () => {
    assert.equal(GROUP.includes("icon:"), false);
  });

  it("gates the AI row on showAiModels, and only it", () => {
    assert.ok(
      GROUP.includes(
        "return showAiModels ? <AppsAndAi {...props} /> : <AppsOnly {...props} />;",
      ),
    );
    assert.equal(GROUP.match(/showAiModels \?/g)?.length, 1);
    assert.ok(GROUP.includes("rows={[useAppsRow(props)]}"));
    assert.ok(GROUP.includes("rows={[apps, ai]}"), "apps first");
  });
});

describe("the phone's More card", () => {
  it("tells the rail's story: switcher, plan, connect rows, account, Admin, Academy, Settings", () => {
    inOrder(MORE_MENU, [
      "<SidebarWorkspaceSwitcher",
      "<PlanUpgradeRow",
      "<ConnectGroup",
      "<MobileAccountRow",
      "{showOrganization && <MobileMoreRowButton row={admin} />}",
      "<MobileMoreRowButton row={academy} />",
      "<MobileMoreRowButton row={settings} />",
    ]);
    assert.ok(MORE_MENU.includes('nav="reset"'));
    assert.ok(MORE_MENU.includes('openSettings(null, { nav: "reset" })'));
  });

  it("draws every row as a sheet row: one left edge, one type size", () => {
    assert.equal(MORE_MENU.match(/surface="sheet"/g)?.length, 2);
    assert.match(MORE_MENU, /<PlanUpgradeRow[^>]*surface="sheet"/);
    assert.match(MORE_MENU, /<ConnectGroup[^>]*surface="sheet"/);
    assert.ok(!MORE_MENU.includes("px-2"), "no rail inset re-padded");
    assert.equal(
      MORE_ROW.match(/className=\{sidebarSheetRowClasses\}/g)?.length,
      2,
    );
    assert.ok(!MORE_ROW.includes("min-h-12"), "no copy of the sheet row");
    assert.ok(GROUP.includes("surface={props.surface}"));
  });
});

describe("tour anchors", () => {
  const shell = new URL("../src/components/shell/", import.meta.url);
  const sources = readdirSync(shell)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => read(`../src/components/shell/${name}`));

  it("each rail destination anchor has exactly one producer", () => {
    for (const target of [
      "workspaceMenu",
      "nav-integrations",
      "nav-ai-hub",
      "nav-academy",
      "nav-settings",
    ]) {
      const producers = sources.filter((source) =>
        source.includes(`tourAnchor("${target}")`),
      );
      assert.equal(producers.length, 1, target);
    }
    assert.ok(ROWS.includes('dataAttrs: tourAnchor("nav-academy")'));
    assert.ok(ROWS.includes('dataAttrs: tourAnchor("nav-settings")'));
    assert.ok(ROWS.includes('dataAttrs: { "data-testid": "rail-admin" }'));
  });
});

describe("destinations the IA deleted", () => {
  const VIEWS = read("../src/lib/top-level-views.ts");
  const SETTINGS_SECTIONS = read("../src/lib/settings-sections.ts");

  it("stay deleted: no Inbox or Skills screen", () => {
    assert.ok(!VIEWS.includes("INBOX_VIEW_ID"), "no Inbox screen");
    assert.ok(!VIEWS.includes("SKILLS_VIEW_ID"), "no Skills screen");
  });

  it("keep the person, Admin and Skills out of Settings", () => {
    assert.ok(!SETTINGS_SECTIONS.includes('"profile"'));
    assert.ok(!SETTINGS_SECTIONS.includes('"aboutMe"'));
    assert.ok(!SETTINGS_SECTIONS.includes('"workspace"'));
    assert.ok(!SETTINGS_SECTIONS.includes('"skills"'));
  });
});
