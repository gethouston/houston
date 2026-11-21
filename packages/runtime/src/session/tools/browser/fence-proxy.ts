import { createServer, connect as netConnect, type Socket } from "node:net";
import {
  connectJudged,
  dial,
  type FenceConnect,
  type Judge,
  type Open,
} from "./fence-dial";
import { relayOne } from "./fence-forward";
import { lookupFor } from "./fence-resolve";
import { answer, tunnel } from "./fence-splice";
import {
  bareHost,
  type FenceLookup,
  type FenceVerdict,
  judgeTarget,
} from "./fence-target";
import { headEnd, MAX_HEAD_BYTES, parseProxyRequest } from "./fence-wire";
import {
  type OwnAddresses,
  ownAddresses,
  type PrivateNetworks,
} from "./ip-ranges";

export type { FenceConnect } from "./fence-dial";

export interface FenceNet {
  lookup?: FenceLookup;
  connect?: FenceConnect;
  attemptMs?: number;
  own?: () => OwnAddresses;
  headMs?: number;
  connectBoundMs?: number;
}

export interface FenceProxy {
  readonly port: number;
  refused(host: string): boolean;
  close(): Promise<void>;
}

const HEAD_TIMEOUT_MS = 15_000;
const REFUSAL_MEMORY_MS = 60_000;
const REFUSAL_MEMORY_SIZE = 64;

export async function startFenceProxy(
  privateNetworks: PrivateNetworks,
  net: FenceNet = {},
): Promise<FenceProxy> {
  const lookup = net.lookup ?? lookupFor(privateNetworks);
  const connect =
    net.connect ?? ((host, port) => netConnect({ host, port, noDelay: true }));
  const own = net.own ?? (() => ownAddresses());
  const refusals = new Map<string, number>();
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const judge: Judge = async (host, signal) => {
    let verdict: FenceVerdict;
    try {
      verdict = await judgeTarget(
        host,
        privateNetworks,
        (name) => lookup(name, signal),
        own(),
      );
    } catch (error) {
      if (signal.aborted) return { kind: "unreachable" };
      console.warn(
        "[browser] fence: resolving a host failed",
        errorCode(error),
      );
      verdict = { kind: "unreachable" };
    }
    if (verdict.kind === "refused") {
      refusals.delete(bareHost(host));
      refusals.set(bareHost(host), Date.now());
      const oldest = refusals.keys().next().value;
      if (refusals.size > REFUSAL_MEMORY_SIZE && oldest !== undefined)
        refusals.delete(oldest);
    }
    return verdict;
  };
  const server = createServer((client) => {
    track(client);
    const open: Open = (addresses, port, signal) =>
      dial(
        addresses,
        port,
        (address, at) => {
          const upstream = connect(address, at);
          track(upstream);
          return upstream;
        },
        net.attemptMs,
        signal,
      );
    serve(client, judge, open, net);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("the browser's fence proxy has no port");
  let closing: Promise<void> | null = null;
  return {
    port: address.port,
    refused: (host) =>
      Date.now() - (refusals.get(bareHost(host)) ?? 0) < REFUSAL_MEMORY_MS,
    close: () => {
      closing ??= new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      });
      return closing;
    },
  };
}

function serve(client: Socket, judge: Judge, open: Open, net: FenceNet): void {
  let buffered = Buffer.alloc(0);
  client.on("error", () => client.destroy());
  client.setTimeout(net.headMs ?? HEAD_TIMEOUT_MS, () => client.destroy());
  const onData = (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    const end = headEnd(buffered);
    if (end === -1) {
      if (buffered.length > MAX_HEAD_BYTES) {
        client.off("data", onData);
        answer(client, "malformed");
      }
      return;
    }
    client.off("data", onData);
    client.pause();
    client.setTimeout(0);
    const request = parseProxyRequest(buffered.subarray(0, end));
    const rest = buffered.subarray(end);
    if (request.kind === "malformed" || request.kind === "length_required") {
      answer(client, request.kind);
      return;
    }
    connectJudged(
      client,
      judge,
      open,
      request.host,
      request.port,
      net.connectBoundMs,
    )
      .then((upstream) => {
        if (!upstream) return;
        if (request.kind === "connect") tunnel(client, upstream, rest);
        else relayOne(client, upstream, request.head, request.bodyLength, rest);
      })
      .catch((error: unknown) => {
        console.error("[browser] fence: relaying a request failed", error);
        client.destroy();
      });
  };
  client.on("data", onData);
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : "unknown";
}
