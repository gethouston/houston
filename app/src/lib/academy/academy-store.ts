import { mergeAcademyRecords } from "./academy-merge.ts";
import {
  ACADEMY_PREF_KEY,
  type AcademyRecord,
  serializeAcademyRecord,
} from "./academy-record.ts";
import { parseAcademyRecord } from "./academy-record-parse.ts";

export interface AcademyStorePorts {
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  readLocal(): string | null;
  writeLocal(value: string): void;
}

export interface AcademyDevice {
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  readLocal(key: string): string | null;
  writeLocal(key: string, value: string): void;
}

export function academyLocalKey(uid: string | null): string {
  return `${ACADEMY_PREF_KEY}:${uid ?? "anon"}`;
}

export function academyPortsFor(
  device: AcademyDevice,
  uid: string | null,
  getActiveUid: () => string | null,
): AcademyStorePorts {
  const localKey = academyLocalKey(uid);
  const serves = () => getActiveUid() === uid;
  return {
    getPreference: async (key) => {
      if (!serves()) throw new Error("[academy] account changed mid-read");
      const value = await device.getPreference(key);
      if (!serves()) throw new Error("[academy] account changed mid-read");
      return value;
    },
    setPreference: async (key, value) => {
      if (!serves()) return;
      await device.setPreference(key, value);
    },
    readLocal: () => device.readLocal(localKey),
    writeLocal: (value) => device.writeLocal(localKey, value),
  };
}

export interface AcademyLoad {
  record: AcademyRecord | null;
  engineRead: boolean;
}

export async function loadAcademyRecord(
  ports: AcademyStorePorts,
): Promise<AcademyLoad> {
  let raw: string | null = null;
  let engineRead = true;
  try {
    raw = await ports.getPreference(ACADEMY_PREF_KEY);
  } catch {
    engineRead = false;
  }
  const merged = mergeAcademyRecords(
    parseAcademyRecord(raw),
    parseAcademyRecord(ports.readLocal()),
  );
  if (!merged) return { record: null, engineRead };
  const serialized = serializeAcademyRecord(merged);
  ports.writeLocal(serialized);
  if (engineRead && raw !== serialized) {
    void ports.setPreference(ACADEMY_PREF_KEY, serialized).catch((e) => {
      console.error("[academy] engine pref heal failed", e);
    });
  }
  return { record: merged, engineRead };
}

export function academyLoadFailed(load: AcademyLoad): boolean {
  return !load.engineRead && load.record === null;
}

export async function saveAcademyRecord(
  ports: AcademyStorePorts,
  record: AcademyRecord,
): Promise<void> {
  const serialized = serializeAcademyRecord(record);
  ports.writeLocal(serialized);
  try {
    await ports.setPreference(ACADEMY_PREF_KEY, serialized);
  } catch (e) {
    console.error("[academy] engine pref write failed", e);
  }
}
