import { readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = process.argv[2];
if (!root || !(await stat(root)).isDirectory()) {
  throw new Error("Provide an extracted desktop application directory.");
}
const files = await readdir(root, { recursive: true });
if (files.length === 0) throw new Error("The application payload is empty.");
const retired = files.filter((file) => /^frpc(?:-|\.|$)/i.test(basename(file)));
if (retired.length > 0) {
  throw new Error(
    `Retired FRP client found in release payload: ${retired.join(", ")}`,
  );
}
console.log(
  `Verified ${files.length} application entries in ${resolve(root)}: no FRP client.`,
);
