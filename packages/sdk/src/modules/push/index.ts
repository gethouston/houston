import type {
  PushDeviceRegistration,
  PushDeviceResponse,
} from "@houston/wire-types";
import {
  pushDeviceRegistrationSchema,
  pushPresenceSchema,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { requireString } from "../payload";
import { putPushPresence, registerDevice, unregisterDevice } from "./http";

export const PushCommand = {
  Register: "push/registerDevice",
  Unregister: "push/unregisterDevice",
  Presence: "push/reportPresence",
} as const;
export class PushHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "PushHttpError");
  }
}
export interface PushModule {
  deviceId(): Promise<string>;
  registerDevice(
    deviceId: string,
    input: PushDeviceRegistration,
    signal?: AbortSignal,
  ): Promise<PushDeviceResponse>;
  unregisterDevice(deviceId: string, signal?: AbortSignal): Promise<void>;
  reportPresence(foreground: boolean, signal?: AbortSignal): Promise<void>;
  startPresence(
    foreground: () => boolean,
    onError: (error: unknown) => void,
  ): () => void;
}

const DEVICE_KEY = "push.device_id";
const REGISTRATION_KEY = "push.registration";
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESENCE_MS = 60 * 1000;

export function createPushModule(ctx: ModuleContext): PushModule {
  const scope = moduleScope(ctx, "push", PushHttpError);
  const prefs = ctx.config.ports.devicePreferences;
  let idPromise: Promise<string> | null = null;
  let registrationInFlight: {
    key: string;
    promise: Promise<PushDeviceResponse>;
  } | null = null;
  const deviceId = () => {
    idPromise ??= (async () => {
      const saved = await prefs.get(DEVICE_KEY);
      if (saved) return saved;
      const minted = crypto.randomUUID();
      await prefs.set(DEVICE_KEY, minted);
      return minted;
    })();
    return idPromise;
  };
  const module: PushModule = {
    deviceId,
    registerDevice: (id, input, signal) => {
      input = pushDeviceRegistrationSchema.parse(input);
      const userId = ctx.config.ports.userId?.() ?? null;
      const key = JSON.stringify([userId, id, input]);
      if (registrationInFlight?.key === key)
        return registrationInFlight.promise;
      if (registrationInFlight) {
        const previous = registrationInFlight.promise;
        return previous.then(
          () => module.registerDevice(id, input, signal),
          () => module.registerDevice(id, input, signal),
        );
      }
      const promise = (async () => {
        const stored = await prefs.get(REGISTRATION_KEY);
        if (stored) {
          const prior = JSON.parse(stored) as {
            input: PushDeviceRegistration;
            at: number;
            userId?: string;
          };
          if (prior.userId !== userId) await prefs.delete(REGISTRATION_KEY);
          if (
            userId &&
            prior.userId === userId &&
            JSON.stringify(prior.input) === JSON.stringify(input) &&
            ctx.config.ports.clock.now() - prior.at < DAY_MS
          )
            return { device_id: id };
        }
        let result: PushDeviceResponse;
        try {
          result = await registerDevice(scope, id, input, signal);
        } catch (error) {
          if (!isDeviceConflict(error)) throw error;
          const fresh = crypto.randomUUID();
          await prefs.set(DEVICE_KEY, fresh);
          idPromise = Promise.resolve(fresh);
          result = await registerDevice(scope, fresh, input, signal);
        }
        await prefs.set(
          REGISTRATION_KEY,
          JSON.stringify({ input, at: ctx.config.ports.clock.now(), userId }),
        );
        return result;
      })();
      registrationInFlight = { key, promise };
      const clear = () => {
        if (registrationInFlight?.promise === promise)
          registrationInFlight = null;
      };
      void promise.then(clear, clear);
      return promise;
    },
    unregisterDevice: async (id, signal) => {
      try {
        await unregisterDevice(scope, id, signal);
      } finally {
        await prefs.delete(REGISTRATION_KEY);
      }
    },
    reportPresence: async (foreground, signal) =>
      putPushPresence(
        scope,
        pushPresenceSchema.parse({ client_id: await deviceId(), foreground }),
        signal,
      ),
    startPresence: (foreground, onError) => {
      let timer: ReturnType<typeof setInterval> | null = null;
      const send = () => {
        void module.reportPresence(foreground()).catch(onError);
      };
      const update = () => {
        if (timer) clearInterval(timer);
        timer = foreground() ? setInterval(send, PRESENCE_MS) : null;
        send();
      };
      document.addEventListener("visibilitychange", update);
      window.addEventListener("focus", update);
      window.addEventListener("blur", update);
      update();
      return () => {
        document.removeEventListener("visibilitychange", update);
        window.removeEventListener("focus", update);
        window.removeEventListener("blur", update);
        if (timer) clearInterval(timer);
      };
    },
  };
  ctx.registerCommand(PushCommand.Register, (p) =>
    module.registerDevice(
      requireString(p, "deviceId"),
      (p as { input: PushDeviceRegistration }).input,
    ),
  );
  ctx.registerCommand(PushCommand.Unregister, (p) =>
    module.unregisterDevice(requireString(p, "deviceId")),
  );
  ctx.registerCommand(PushCommand.Presence, (p) =>
    module.reportPresence((p as { foreground: boolean }).foreground),
  );
  return module;
}

function isDeviceConflict(error: unknown): boolean {
  if (!(error instanceof PushHttpError) || error.status !== 409) return false;
  try {
    return (
      (JSON.parse(error.message) as { code?: unknown }).code ===
      "device_conflict"
    );
  } catch {
    return false;
  }
}
