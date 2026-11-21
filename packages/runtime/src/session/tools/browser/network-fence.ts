const UNRESOLVABLE = [
  "0.0.0.0",
  "::",
  "metadata",
  "metadata.",
  "*.internal",
  "*.internal.",
];

export function networkFenceArgs(proxyPort: number): string[] {
  return [
    `--proxy-server=http://127.0.0.1:${proxyPort}`,
    "--proxy-bypass-list=<-loopback>",
    `--host-resolver-rules=${UNRESOLVABLE.map((host) => `MAP ${host} ~NOTFOUND`).join(", ")}`,
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  ];
}
