export default function () {
  return {
    gatewayUrl:
      process.env.PUBLIC_GATEWAY_URL || "https://gateway.gethouston.ai",
  };
}
