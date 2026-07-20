import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  decideStoreInstallDrive,
  initialStoreInstallDriveState,
  type StoreInstallDriveEffect,
  type StoreInstallDriveInput,
  type StoreInstallDriveState,
} from "../src/lib/store-install-drive.ts";

// The store-install deep link must seed the import wizard exactly ONCE per
// intent. The reducer below is the guard: a second delivery of the same slug
// (website "Open in Houston" double-click, or cold-start drain + live event both
// surfacing the URL) must be dropped, never re-driven — otherwise the wizard
// spontaneously re-opens and the install ping double-increments when the first
// wizard is closed.

/**
 * Minimal driver mirroring the hook's side effects so a full event sequence can
 * be replayed against the pure reducer. Each `tick` applies one processing pass;
 * the caller mutates `pending` / `wizardOpen` between ticks to model deliveries,
 * the async import completing, and the user closing the wizard.
 */
class Driver {
  state: StoreInstallDriveState = { ...initialStoreInstallDriveState };
  pending: string | null = null;
  wizardOpen = false;
  shellLive = true;
  readonly effects: StoreInstallDriveEffect[] = [];

  tick(): StoreInstallDriveEffect {
    const input: StoreInstallDriveInput = {
      pendingSlug: this.pending,
      wizardOpen: this.wizardOpen,
      shellLive: this.shellLive,
    };
    const { next, effect, slug } = decideStoreInstallDrive(this.state, input);
    this.state = next;
    this.effects.push(effect);
    if (effect === "drop") this.pending = null;
    if (effect === "drive") {
      strictEqual(slug, input.pendingSlug);
      this.pending = null;
    }
    return effect;
  }

  /** Model the async import resolving: wizard opens, run finishes. */
  completeDrive(): void {
    this.wizardOpen = true;
    this.state = { ...this.state, running: false };
  }

  driveCount(): number {
    return this.effects.filter((e) => e === "drive").length;
  }
}

describe("decideStoreInstallDrive — single delivery", () => {
  it("drives once when the shell is live", () => {
    const d = new Driver();
    d.pending = "my-agent";
    strictEqual(d.tick(), "drive");
    strictEqual(d.pending, null);
    strictEqual(d.driveCount(), 1);
  });

  it("waits (retains the slug) until the shell is live", () => {
    const d = new Driver();
    d.shellLive = false;
    d.pending = "my-agent";
    strictEqual(d.tick(), "idle");
    strictEqual(d.pending, "my-agent", "slug must survive to drive later");
    d.shellLive = true;
    strictEqual(d.tick(), "drive");
    strictEqual(d.driveCount(), 1);
  });
});

describe("decideStoreInstallDrive — duplicate delivery (the bug)", () => {
  it("does not double-drive when a duplicate arrives during the drive", () => {
    const d = new Driver();
    d.pending = "my-agent";
    strictEqual(d.tick(), "drive"); // A drives, pending cleared

    // Second delivery arrives while the import is still awaiting.
    d.pending = "my-agent";
    strictEqual(d.tick(), "drop");
    strictEqual(d.pending, null, "duplicate must be cleared, not retained");

    d.completeDrive(); // wizard opens, run finishes
    d.tick(); // re-render on wizardOpen change: nothing pending

    // User closes the wizard.
    d.wizardOpen = false;
    strictEqual(d.tick(), "idle");
    strictEqual(d.driveCount(), 1, "must drive exactly once");
  });

  it("does not double-drive when a duplicate arrives while the wizard is open", () => {
    const d = new Driver();
    d.pending = "my-agent";
    strictEqual(d.tick(), "drive");
    d.completeDrive();
    d.tick(); // wizard now open

    // Second delivery arrives while the wizard is open.
    d.pending = "my-agent";
    strictEqual(d.tick(), "drop");
    strictEqual(d.pending, null);

    d.wizardOpen = false;
    d.tick(); // wizard closed
    strictEqual(d.driveCount(), 1);
  });
});

describe("decideStoreInstallDrive — legitimate flows still work", () => {
  it("queues a genuinely different agent that arrives while a wizard is open", () => {
    const d = new Driver();
    d.pending = "agent-a";
    strictEqual(d.tick(), "drive");
    d.completeDrive();
    d.tick(); // wizard A open

    // A different agent's deep link arrives while wizard A is open.
    d.pending = "agent-b";
    strictEqual(d.tick(), "idle");
    strictEqual(
      d.pending,
      "agent-b",
      "a new agent must be retained, not dropped",
    );

    d.wizardOpen = false; // user closes wizard A
    strictEqual(d.tick(), "drive"); // agent B drives after close
    strictEqual(d.driveCount(), 2);
  });

  it("allows re-installing the same slug after the wizard is closed", () => {
    const d = new Driver();
    d.pending = "my-agent";
    strictEqual(d.tick(), "drive");
    d.completeDrive();
    d.tick(); // wizard open
    d.wizardOpen = false;
    d.tick(); // wizard closed -> driven-slug guard released

    // A genuinely new, post-close delivery of the same slug.
    d.pending = "my-agent";
    strictEqual(d.tick(), "drive");
    strictEqual(d.driveCount(), 2);
  });
});

describe("decideStoreInstallDrive — the driven-slug guard opens only on close", () => {
  it("keeps the guard armed through the pre-open window", () => {
    // Between dispatch and the wizard actually opening, wizardOpen is still
    // false; that must NOT be mistaken for a close, or the guard releases and a
    // duplicate re-drives.
    const before = decideStoreInstallDrive(
      { running: true, drivenSlug: "my-agent", wizardWasOpen: false },
      { pendingSlug: "my-agent", wizardOpen: false, shellLive: true },
    );
    strictEqual(before.effect, "drop");
    deepStrictEqual(before.next.drivenSlug, "my-agent");
  });
});
