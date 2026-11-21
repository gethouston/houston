import type { Socket } from "node:net";
import { type ProxyAnswerKind, proxyAnswer, TUNNEL_OPEN } from "./fence-wire";

export const IDLE_MS = 5 * 60_000;

export function answer(client: Socket, kind: ProxyAnswerKind): void {
  client.end(proxyAnswer(kind));
  client.resume();
}

export function bindEnds(client: Socket, upstream: Socket): () => void {
  const cut = () => {
    upstream.destroy();
    client.destroy();
  };
  upstream.on("error", cut);
  upstream.setTimeout(IDLE_MS, cut);
  client.setTimeout(IDLE_MS, cut);
  client.once("close", () => upstream.destroy());
  return cut;
}

export function tunnel(client: Socket, upstream: Socket, first: Buffer): void {
  bindEnds(client, upstream);
  client.write(TUNNEL_OPEN);
  if (first.length > 0) upstream.write(first);
  client.pipe(upstream);
  upstream.pipe(client);
  client.resume();
}
