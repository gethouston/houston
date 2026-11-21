import {
  type AccountLinkPort,
  createIdentityModule,
  type IdentityModule,
  type IdentitySession,
} from "@houston/sdk";

export function createIdentityClient<S extends IdentitySession>(opts: {
  gatewayUrl: () => string;
  port: AccountLinkPort<S>;
}): IdentityModule {
  return createIdentityModule({
    baseUrl: opts.gatewayUrl,
    fetch: (input, init) => globalThis.fetch(input, init),
    port: opts.port,
  });
}
