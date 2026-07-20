// Single source of truth for the public Houston Cloud API gateway origin.
//
// Every developer-docs page (base URL, curl examples, MCP config, A2A calls)
// renders the gateway host from `api.gatewayUrl`. Change it HERE and all of
// /developers/** updates on the next build. Do not hardcode the gateway host
// anywhere else. Overridable at build time via PUBLIC_GATEWAY_URL.
export default function () {
  return {
    gatewayUrl:
      process.env.PUBLIC_GATEWAY_URL || "https://gateway.gethouston.ai",
  };
}
