import { z } from "zod";

export const pushDeviceRegistrationSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["ios", "android"]),
  locale: z
    .string()
    .min(1)
    .max(35)
    .refine((value) => {
      try {
        return Intl.getCanonicalLocales(value).length === 1;
      } catch {
        return false;
      }
    }),
  app_version: z.string().max(32),
});
export type PushDeviceRegistration = z.infer<
  typeof pushDeviceRegistrationSchema
>;

export const pushPresenceSchema = z.object({
  client_id: z.uuid(),
  foreground: z.boolean(),
});
export type PushPresence = z.infer<typeof pushPresenceSchema>;

export const pushDeviceResponseSchema = z.object({
  device_id: z.uuid(),
});
export type PushDeviceResponse = z.infer<typeof pushDeviceResponseSchema>;
