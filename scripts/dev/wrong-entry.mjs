// Guard for retired run commands. Muscle memory (`pnpm start`, `pnpm
// dev:cloud`, `cd app && pnpm start`) must hit a signpost, not a silently
// different app — divergent local stacks are the exact bug the unified loop
// removed. Deliberately kept as scripts that FAIL LOUDLY instead of deleted
// entries, whose "ERR_PNPM_NO_SCRIPT" says nothing about where to go.
const attempted = process.argv[2] ?? "that command";

process.stderr.write(
  [
    "",
    `✗ \`pnpm ${attempted}\` is retired. There is ONE way to run Houston:`,
    "",
    "    pnpm dev",
    "",
    "It preflights your machine (doctor), then boots the full stack: the",
    "desktop app, the web app with real sign-in and multiplayer, and the",
    "local cloud (gateway + engines as processes). Same stack for the whole",
    "team, every time. Reference: knowledge-base/dev-loop.md",
    "",
  ].join("\n"),
);
process.exit(1);
