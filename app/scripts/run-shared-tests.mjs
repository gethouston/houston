import { run } from "node:test";
import { spec } from "node:test/reporters";

const stream = run({ files: process.argv.slice(2), isolation: "none" });
stream.on("test:fail", () => {
  process.exitCode = 1;
});
stream.compose(spec).pipe(process.stdout);
