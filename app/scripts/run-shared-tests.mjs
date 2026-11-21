import { run } from "node:test";
import { spec } from "node:test/reporters";

// The CLI sorts file arguments before running them. The API preserves the
// seeded file order, including on CI's Node 22.
const stream = run({ files: process.argv.slice(2), isolation: "none" });
stream.on("test:fail", () => {
  process.exitCode = 1;
});
stream.compose(spec).pipe(process.stdout);
