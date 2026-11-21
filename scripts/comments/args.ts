export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
  values: (name: string) => string[];
}

export function parseArgs(
  argv: readonly string[],
  valued: readonly string[],
): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const repeated = new Map<string, string[]>();
  const keep = (name: string, value: string): void => {
    flags.set(name, value);
    repeated.set(name, [...(repeated.get(name) ?? []), value]);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (!valued.includes(name)) flags.set(name, true);
    else if (inline !== undefined) keep(name, inline);
    else if (i + 1 < argv.length) keep(name, argv[++i]);
    else throw new Error(`--${name} needs a value`);
  }
  return {
    positional,
    flags,
    values: (name) => repeated.get(name) ?? [],
  };
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
