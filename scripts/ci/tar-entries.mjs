import { createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";

const TYPES = {
  0: "file",
  "\0": "file",
  1: "hardlink",
  2: "symlink",
  5: "dir",
};

const field = (block, start, length) => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString("utf8");
};

const octal = (block, start, length) => {
  if (block[start] & 0x80) {
    let value = 0;
    for (let i = start + 1; i < start + length; i += 1) {
      value = value * 256 + block[i];
    }
    return value;
  }
  const text = field(block, start, length).trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
};

const paxRecords = (data) => {
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString(), 10);
    if (!(length > 0)) break;
    const record = data
      .subarray(space + 1, offset + length - 1)
      .toString("utf8");
    const eq = record.indexOf("=");
    records[record.slice(0, eq)] = record.slice(eq + 1);
    offset += length;
  }
  return records;
};

/** @param {AsyncIterable<Buffer>} chunks gunzipped tar bytes */
export async function listTarEntries(chunks) {
  const entries = [];
  let buffer = Buffer.alloc(0);
  let pending = null;
  let skip = 0;
  let next = {};
  let ended = false;

  const consume = () => {
    for (;;) {
      if (skip > 0) {
        const n = Math.min(skip, buffer.length);
        buffer = buffer.subarray(n);
        skip -= n;
        if (skip > 0) return;
      }
      if (pending) {
        const padded = Math.ceil(pending.size / 512) * 512;
        if (buffer.length < padded) return;
        const data = buffer.subarray(0, pending.size);
        buffer = buffer.subarray(padded);
        if (pending.kind === "x") {
          const pax = paxRecords(data);
          if (pax.path !== undefined) next.path = pax.path;
          if (pax.size !== undefined) next.size = Number(pax.size);
          if (pax.linkpath !== undefined) next.link = pax.linkpath;
        } else if (pending.kind === "L") {
          next.path = data.toString("utf8").replace(/\0+$/, "");
        } else if (pending.kind === "K") {
          next.link = data.toString("utf8").replace(/\0+$/, "");
        }
        pending = null;
      }
      if (ended || buffer.length < 512) return;
      const block = buffer.subarray(0, 512);
      buffer = buffer.subarray(512);
      if (block.every((byte) => byte === 0)) {
        ended = true;
        return;
      }
      const flag = String.fromCharCode(block[156]);
      const size = next.size ?? octal(block, 124, 12);
      if (flag === "x" || flag === "L" || flag === "K" || flag === "g") {
        pending = { kind: flag, size };
        continue;
      }
      const name = field(block, 0, 100);
      const prefix =
        field(block, 257, 6) === "ustar" ? field(block, 345, 155) : "";
      const path = next.path ?? (prefix ? `${prefix}/${name}` : name);
      const link = next.link ?? field(block, 157, 100);
      const mode = (octal(block, 100, 8) & 0o7777).toString(8).padStart(4, "0");
      const type = TYPES[flag] ?? `type-${flag}`;
      entries.push(`${type}\t${mode}\t${path.replace(/\/+$/, "")}\t${link}`);
      next = {};
      skip =
        type === "file" || type.startsWith("type-")
          ? Math.ceil(size / 512) * 512
          : 0;
    }
  };

  for await (const chunk of chunks) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    consume();
  }
  consume();
  if (!ended)
    throw new Error("tar archive ends without its end-of-archive block");
  return entries.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tar-entries.mjs <file.tar.gz>");
  const entries = await listTarEntries(
    createReadStream(file).pipe(createGunzip()),
  );
  process.stdout.write(entries.map((entry) => `${entry}\n`).join(""));
}
