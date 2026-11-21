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
    "team, every time.",
    "",
  ].join("\n"),
);
process.exit(1);
