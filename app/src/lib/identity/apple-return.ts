export const APPLE_RETURN_PATH = "/v1/auth/apple/return";

export function appleReturnUrl(gatewayBaseUrl: string): string {
  return `${gatewayBaseUrl.replace(/\/+$/, "")}${APPLE_RETURN_PATH}`;
}
