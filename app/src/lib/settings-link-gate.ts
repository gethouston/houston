import { carriesTicket, type SettingsLanding } from "./settings-landing.ts";

/**
 * The OS keeps answering the cold-start read with the link that launched the
 * app until the process exits (tauri-plugin-deep-link's `getCurrent()`), so
 * every remount of the shell and every webview reload reads the same
 * `houston://settings/channels?slack=<ticket>` again. Redeeming it again asks
 * the gateway for a spent ticket, which it answers with the same 404 it gives a
 * stranger, and after a sign-out it would post one account's ticket as
 * another. A link carrying a completion is therefore handed over once per app
 * run: remembered in memory for this webview, and as a SHA-256 digest (never
 * the ticket) in session storage so a reload remembers it too.
 */
export interface HandedLinks {
  /** True the first time `link` is claimed in this app run, false after. */
  claim(link: string): Promise<boolean>;
}

/** Session storage as the ledger sees it; a failure reaches `report`. */
export interface LinkLedger {
  read(): string | null;
  write(value: string): void;
}

/** Enough for any realistic number of connects in one app run. */
const LEDGER_LIMIT = 20;

export function createHandedLinks(
  ledger: LinkLedger,
  report: (error: unknown) => void,
): HandedLinks {
  const claimed = new Set<string>();
  return {
    async claim(link) {
      // Recorded before the first await, so the cold-start read and the live
      // listener carrying the same link cannot both pass.
      if (claimed.has(link)) return false;
      claimed.add(link);
      try {
        const digest = await sha256Hex(link);
        const seen = ledgerDigests(ledger.read(), report);
        if (seen.includes(digest)) return false;
        ledger.write(JSON.stringify([...seen, digest].slice(-LEDGER_LIMIT)));
      } catch (error) {
        // The in-memory record still holds for this webview's life.
        report(error);
      }
      return true;
    },
  };
}

function ledgerDigests(
  raw: string | null,
  report: (error: unknown) => void,
): string[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Reported, then treated as empty so the next write replaces it.
    report(error);
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === "string")
    : [];
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Where a landing came from. A deep link names its text so a replay of one
 * carrying a completion is dropped; a bare `houston://settings/channels` spends
 * nothing and applies on every offer, a remount's replay included, as
 * `houston://settings/plan` does. The web callback's ticket was stripped from the address bar as it
 * was read, so it can never come back and carries none.
 */
export type LandingOffer = {
  landing: SettingsLanding;
  link: string | null;
  /** Told once the landing was applied (the boot landing's acknowledgement). */
  applied?: () => void;
};

export interface LandingGatePorts {
  isReady: () => boolean;
  apply: (landing: SettingsLanding) => void;
  handed: HandedLinks;
  report: (error: unknown) => void;
}

export interface LandingGate {
  /** A landing from any source: applied now if the app is ready, else held. */
  offer(offer: LandingOffer): Promise<void>;
  /** The app became ready: apply what was held. */
  flush(): Promise<void>;
}

/**
 * Hold the latest landing until sign-in, the space and capabilities are in,
 * then apply it once. A completion link already handed over is dropped before
 * anything opens, so its replay does not even pop Settings open.
 */
export function createLandingGate(ports: LandingGatePorts): LandingGate {
  let held: LandingOffer | null = null;
  const deliver = async ({ landing, link, applied }: LandingOffer) => {
    try {
      // Only a link carrying a completion is spent by applying it. A bare
      // `houston://settings/channels` (the gateway's failure page) must open
      // Channels every time it is clicked.
      const spends = link !== null && carriesTicket(landing);
      if (!spends || (await ports.handed.claim(link))) {
        ports.apply(landing);
        applied?.();
      }
    } catch (error) {
      ports.report(error);
    }
  };
  return {
    async offer(offer) {
      if (offer.landing.kind === "absent") return;
      if (ports.isReady()) await deliver(offer);
      else held = offer;
    },
    async flush() {
      if (!held || !ports.isReady()) return;
      const next = held;
      held = null;
      await deliver(next);
    },
  };
}
