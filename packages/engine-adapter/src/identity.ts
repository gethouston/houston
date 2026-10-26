/**
 * The pre-auth binding of `@houston/sdk`'s identity module: email-code sign-in
 * and the account-exists link, against the gateway's `/v1/auth/email-otp/*`.
 *
 * The fetch carries no bearer and no `x-houston-org`: the person is not signed
 * in yet, so `gatewayAuthFetch` and the client it backs do not exist. Calls do
 * not go through `viaSdk` either. It translates failures into
 * `HoustonEngineError` for agent and space routes, which would erase the SDK's
 * typed email-code refusal.
 */

import {
  type AccountLinkPort,
  createIdentityModule,
  type IdentityModule,
  type IdentitySession,
} from "@houston/sdk";

export function createIdentityClient<S extends IdentitySession>(opts: {
  /** Read per request; it throws while no gateway is configured. */
  gatewayUrl: () => string;
  port: AccountLinkPort<S>;
}): IdentityModule {
  return createIdentityModule({
    baseUrl: opts.gatewayUrl,
    fetch: (input, init) => globalThis.fetch(input, init),
    port: opts.port,
  });
}
