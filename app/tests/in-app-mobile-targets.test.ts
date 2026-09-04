import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mobileSpotPhase,
  sendMissionSelector,
  sendMissionSurface,
} from "../src/components/onboarding/in-app-mobile-targets.ts";

test("every step is the plain rail spotlight on desktop, phone state notwithstanding", () => {
  for (const home of ["more", "agents"] as const)
    for (const menuOpen of [false, true])
      assert.equal(
        mobileSpotPhase({
          isMobile: false,
          home,
          menuOpen,
          viewMode: "inbox",
        }),
        "rail",
      );
});

test("a More-menu step rings the More button while the menu is shut, then the row inside it", () => {
  const spot = (menuOpen: boolean) =>
    mobileSpotPhase({
      isMobile: true,
      home: "more",
      menuOpen,
      viewMode: "inbox",
    });
  assert.equal(spot(false), "openMenu");
  assert.equal(spot(true), "inMenu");
});

test("an Agents-home step rings the Agents item until that screen is on the glass", () => {
  const spot = (viewMode: string) =>
    mobileSpotPhase({
      isMobile: true,
      home: "agents",
      menuOpen: false,
      viewMode,
    });
  assert.equal(spot("inbox"), "openAgents");
  assert.equal(spot("team"), "openAgents");
  // On the screen the control is plainly there: no dialog, so no `inDialog`.
  assert.equal(spot("agents-home"), "onScreen");
});

test("the send step rings the New task control until the user's own composer is up", () => {
  assert.equal(
    sendMissionSurface({ panelOpen: false, chatOpen: false }),
    "button",
  );
  assert.equal(
    sendMissionSurface({ panelOpen: true, chatOpen: false }),
    "panel",
  );
  // The phone's pushed draft chat is the composer surface there.
  assert.equal(
    sendMissionSurface({ panelOpen: false, chatOpen: true }),
    "chat",
  );
});

test("the desktop New task selector is scoped to the active screen so kept-alive views never win", () => {
  assert.equal(
    sendMissionSelector("button", false, false),
    "[data-screen-active='true'] [data-tour-target='newMission']",
  );
  assert.equal(
    sendMissionSelector("button", true, false),
    "[data-screen-active='true'] [data-tour-target='newMission']",
  );
});

test("the phone New task selector points at the nav bar, which is outside every screen", () => {
  // Scoping it to the active screen would find nothing: the compose control
  // sits beside the nav pill, below the screens, so the veil would cover it.
  assert.equal(
    sendMissionSelector("button", false, true),
    "[data-testid='mobile-nav-bar'] [data-tour-target='newMission']",
  );
  assert.equal(
    sendMissionSelector("button", true, true),
    "[data-testid='mobile-nav-bar'] [data-tour-target='newMission']",
  );
});

test("a composer surface is ringed whole, or its send button alone in email mode", () => {
  // A composer surface is the same node on either breakpoint, so the fork
  // does not reach it.
  for (const isMobile of [false, true]) {
    assert.equal(
      sendMissionSelector("panel", false, isMobile),
      '[data-testid="mission-panel"]',
    );
    assert.equal(
      sendMissionSelector("panel", true, isMobile),
      '[data-testid="mission-panel"] button[type="submit"]',
    );
    assert.equal(
      sendMissionSelector("chat", false, isMobile),
      '[data-testid="mission-chat-screen"]',
    );
    assert.equal(
      sendMissionSelector("chat", true, isMobile),
      '[data-testid="mission-chat-screen"] button[type="submit"]',
    );
  }
});
