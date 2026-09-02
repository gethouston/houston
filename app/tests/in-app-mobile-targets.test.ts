import assert from "node:assert/strict";
import { test } from "node:test";
import {
  drawerSpotPhase,
  sendMissionSelector,
  sendMissionSurface,
} from "../src/components/onboarding/in-app-mobile-targets.ts";

test("a sidebar-row step is the plain rail spotlight on desktop, drawer state notwithstanding", () => {
  assert.equal(drawerSpotPhase({ isMobile: false, drawerOpen: false }), "rail");
  assert.equal(drawerSpotPhase({ isMobile: false, drawerOpen: true }), "rail");
});

test("on the phone the step rings the hamburger while the drawer is shut, then the row inside it", () => {
  assert.equal(
    drawerSpotPhase({ isMobile: true, drawerOpen: false }),
    "openMenu",
  );
  assert.equal(
    drawerSpotPhase({ isMobile: true, drawerOpen: true }),
    "inDrawer",
  );
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

test("the New task selector is scoped to the active screen so kept-alive views never win", () => {
  assert.equal(
    sendMissionSelector("button", false),
    "[data-screen-active='true'] [data-tour-target='newMission']",
  );
  assert.equal(
    sendMissionSelector("button", true),
    "[data-screen-active='true'] [data-tour-target='newMission']",
  );
});

test("a composer surface is ringed whole, or its send button alone in email mode", () => {
  assert.equal(
    sendMissionSelector("panel", false),
    '[data-testid="mission-panel"]',
  );
  assert.equal(
    sendMissionSelector("panel", true),
    '[data-testid="mission-panel"] button[type="submit"]',
  );
  assert.equal(
    sendMissionSelector("chat", false),
    '[data-testid="mission-chat-screen"]',
  );
  assert.equal(
    sendMissionSelector("chat", true),
    '[data-testid="mission-chat-screen"] button[type="submit"]',
  );
});
