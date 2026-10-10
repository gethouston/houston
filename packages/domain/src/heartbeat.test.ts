import { HeartbeatSettingsPatchSchema } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import {
  heartbeatDocKey,
  loadHeartbeat,
  normalizeHeartbeat,
  recordHeartbeatRun,
  setHeartbeatSettings,
} from "./heartbeat";
import { heartbeatDue, localClock, resolveTimezone } from "./heartbeat-clock";
import type { TextStore } from "./store";

function memoryStore(seed: Record<string, string> = {}): TextStore & {
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(seed));
  return {
    files,
    readText: async (key) => files.get(key) ?? null,
    writeText: async (key, content) => {
      files.set(key, content);
    },
  };
}

describe("heartbeat document", () => {
  test("an absent document reads as on at 08:00, never run", async () => {
    expect(await loadHeartbeat(memoryStore(), "Personal")).toEqual({
      enabled: true,
      time: "08:00",
      last: null,
    });
  });

  test("lives beside the preferences doc, above the agent prefixes", () => {
    expect(heartbeatDocKey("Personal")).toBe("ws/Personal/heartbeat.json");
  });

  test("a bad field falls back alone, keeping today's run record", () => {
    const last = { status: "quiet", date: "2026-10-10", at: "x" } as const;
    expect(normalizeHeartbeat({ enabled: false, time: "8am", last })).toEqual({
      enabled: false,
      time: "08:00",
      last,
    });
  });

  test("settings and the run record land on one document without loss", async () => {
    const store = memoryStore();
    await setHeartbeatSettings(store, "P", { time: "07:30" });
    await recordHeartbeatRun(store, "P", {
      status: "error",
      date: "2026-10-10",
      at: "2026-10-10T07:31:00.000Z",
      reason: "no provider",
    });
    const after = await setHeartbeatSettings(store, "P", { enabled: false });
    expect(after).toEqual({
      enabled: false,
      time: "07:30",
      last: {
        status: "error",
        date: "2026-10-10",
        at: "2026-10-10T07:31:00.000Z",
        reason: "no provider",
      },
    });
    expect(JSON.parse(store.files.get(heartbeatDocKey("P")) ?? "")).toEqual(
      after,
    );
  });
});

describe("settings patch validation", () => {
  test.each([
    [{ enabled: false }, true],
    [{ time: "07:05" }, true],
    [{ time: "23:59" }, true],
    [{}, true],
    [{ time: "24:00" }, false],
    [{ time: "7:00" }, false],
    [{ enabled: "yes" }, false],
    [{ time: "08:00", extra: 1 }, false],
  ])("%j valid=%s", (body, valid) => {
    expect(HeartbeatSettingsPatchSchema.safeParse(body).success).toBe(valid);
  });
});

describe("local clock", () => {
  test("reads the date and time in the zone, across midnight", () => {
    const now = new Date("2026-10-10T02:30:00.000Z");
    expect(localClock(now, "America/New_York")).toEqual({
      date: "2026-10-09",
      time: "22:30",
      timezone: "America/New_York",
    });
    expect(localClock(now, "Asia/Tokyo")).toMatchObject({
      date: "2026-10-10",
      time: "11:30",
    });
  });

  test("midnight reads 00:00, never 24:00", () => {
    expect(localClock(new Date("2026-10-10T00:00:00Z"), "UTC").time).toBe(
      "00:00",
    );
  });

  test("follows DST through the zone database", () => {
    // Madrid is UTC+2 in summer and UTC+1 after the last Sunday of October.
    const summer = localClock(
      new Date("2026-10-24T06:00:00Z"),
      "Europe/Madrid",
    );
    const winter = localClock(
      new Date("2026-10-26T06:00:00Z"),
      "Europe/Madrid",
    );
    expect(summer.time).toBe("08:00");
    expect(winter.time).toBe("07:00");
  });

  test("an unknown zone falls back to the host's own", () => {
    expect(resolveTimezone("Mars/Olympus")).toBe(resolveTimezone(null));
    expect(resolveTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});

describe("due rule", () => {
  const settings = { enabled: true, time: "08:00" };
  const at = (time: string, date = "2026-10-10") => ({
    date,
    time,
    timezone: "UTC",
  });
  const ran = (date: string) =>
    ({ status: "delivered", date, at: `${date}T08:00:00Z` }) as const;

  test("not before the chosen time", () => {
    expect(heartbeatDue(settings, null, at("07:59"))).toBe(false);
  });
  test("at or after the chosen time, never run", () => {
    expect(heartbeatDue(settings, null, at("08:00"))).toBe(true);
    expect(heartbeatDue(settings, null, at("15:42"))).toBe(true);
  });
  test("once per local date", () => {
    expect(heartbeatDue(settings, ran("2026-10-10"), at("09:00"))).toBe(false);
  });
  test("a new day is due again; a missed day is not replayed early", () => {
    expect(heartbeatDue(settings, ran("2026-10-08"), at("07:00"))).toBe(false);
    expect(heartbeatDue(settings, ran("2026-10-09"), at("08:01"))).toBe(true);
  });
  test("off means never", () => {
    expect(
      heartbeatDue({ ...settings, enabled: false }, null, at("09:00")),
    ).toBe(false);
  });
  test("an error run still counts for the day", () => {
    const failed = {
      status: "error",
      date: "2026-10-10",
      at: "x",
      reason: "quota",
    } as const;
    expect(heartbeatDue(settings, failed, at("10:00"))).toBe(false);
  });
});
