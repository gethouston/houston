import { z } from "zod";

const id = z.uuid();
const generation = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });

export const ManagedBridgeEndpointSchema = z.strictObject({
  id,
  version: z.literal(1),
});
export type ManagedBridgeEndpoint = z.infer<typeof ManagedBridgeEndpointSchema>;

export const LocalBridgeIdentitySchema = z.strictObject({
  environment: z.url(),
  userId: z.string().min(1).max(256),
  orgId: z.string().min(1).max(256),
  agentId: z.string().min(1).max(256),
});
export type LocalBridgeIdentity = z.infer<typeof LocalBridgeIdentitySchema>;

export const LocalBridgeDeviceSchema = z.strictObject({
  deviceId: id,
  deviceSecret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});
export type LocalBridgeDevice = z.infer<typeof LocalBridgeDeviceSchema>;

export const LocalBridgeRegisterSchema = LocalBridgeDeviceSchema.extend({
  agentId: z.string().min(1).max(256),
  model: z.string().min(1).max(256),
  name: z.string().max(256).optional(),
  shared: z.boolean().optional(),
  idempotencyKey: id,
  legacy: z
    .strictObject({ baseUrl: z.url(), proxyKey: z.string().min(1).max(4096) })
    .optional(),
});
export type LocalBridgeRegister = z.infer<typeof LocalBridgeRegisterSchema>;

export const LocalBridgeLegacyEndpointSchema = z.strictObject({
  baseUrl: z.url(),
  model: z.string().min(1).max(256),
  name: z.string().max(256).optional(),
  contextWindow: z.number().int().positive().optional(),
  reasoning: z.boolean().optional(),
  shared: z.boolean().optional(),
});
export type LocalBridgeLegacyEndpoint = z.infer<
  typeof LocalBridgeLegacyEndpointSchema
>;

export const LocalBridgeDescriptorSchema = z.strictObject({
  bridgeId: id,
  deviceId: id,
  orgId: z.string().min(1),
  userId: z.string().min(1),
  model: z.string().min(1),
  shared: z.boolean(),
  revision: generation,
  baseUrl: z.url(),
});
export type LocalBridgeDescriptor = z.infer<typeof LocalBridgeDescriptorSchema>;

export const LocalBridgeSessionSchema = z.strictObject({
  bridgeId: id,
  connectUrl: z.url(),
  ticket: z.string().min(1).max(4096),
  ticketExpiresAt: timestamp,
  sessionExpiresAt: timestamp,
  generation,
});
export type LocalBridgeSession = z.infer<typeof LocalBridgeSessionSchema>;

export const LocalBridgeRemoteStatusSchema = LocalBridgeDescriptorSchema.extend(
  {
    status: z.enum([
      "offline",
      "connecting",
      "online",
      "model_unavailable",
      "revoked",
    ]),
    generation: generation.optional(),
  },
);
export type LocalBridgeRemoteStatus = z.infer<
  typeof LocalBridgeRemoteStatusSchema
>;

export const LocalBridgeFailureCodeSchema = z.enum([
  "model_unavailable",
  "invalid_request",
  "busy",
  "too_large",
  "upstream_failed",
  "cancelled",
  "timeout",
]);
export type LocalBridgeFailureCode = z.infer<
  typeof LocalBridgeFailureCodeSchema
>;

export const LOCAL_BRIDGE_LIMITS = {
  version: 1,
  subprotocol: "houston-local-model.v1",
  chunkBytes: 65_536,
  messageBytes: 98_304,
  metadataBytes: 16_384,
  requestBytes: 16_777_216,
  initialCreditBytes: 262_144,
  concurrentRequests: 4,
} as const;
