import { carriesTicket, type SettingsLanding } from "./settings-landing.ts";

export interface HandedLinks {
  claim(link: string): Promise<boolean>;
}

export interface LinkLedger {
  read(): string | null;
  write(value: string): void;
}

const LEDGER_LIMIT = 20;

export function createHandedLinks(
  ledger: LinkLedger,
  report: (error: unknown) => void,
): HandedLinks {
  const claimed = new Set<string>();
  return {
    async claim(link) {
      if (claimed.has(link)) return false;
      claimed.add(link);
      try {
        const digest = await sha256Hex(link);
        const seen = ledgerDigests(ledger.read(), report);
        if (seen.includes(digest)) return false;
        ledger.write(JSON.stringify([...seen, digest].slice(-LEDGER_LIMIT)));
      } catch (error) {
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

export type LandingOffer = {
  landing: SettingsLanding;
  link: string | null;
  applied?: () => void;
};

export interface LandingGatePorts {
  isReady: () => boolean;
  apply: (landing: SettingsLanding) => void;
  handed: HandedLinks;
  report: (error: unknown) => void;
}

export interface LandingGate {
  offer(offer: LandingOffer): Promise<void>;
  flush(): Promise<void>;
}

export function createLandingGate(ports: LandingGatePorts): LandingGate {
  let held: LandingOffer | null = null;
  const deliver = async ({ landing, link, applied }: LandingOffer) => {
    try {
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
