import { RULES, type Rule, type Violation } from "./rules.ts";

/** One written excuse. `key` is the violation identity `rule + " " + key`. */
export interface Exception {
  rule: Rule;
  key: string;
  reason: string;
}

export interface Exceptions {
  baseline: number;
  entries: Exception[];
}

export interface Verdict {
  /** The whole report, as the gate prints it. */
  report: string;
  /** Why the process must exit non-zero; empty means parity holds. */
  failures: string[];
}

const isRule = (value: unknown): value is Rule => RULES.includes(value as Rule);

/**
 * The exceptions file's own shape, checked rather than trusted: a typo'd
 * `rule` would otherwise excuse nothing while reading like an accepted debt,
 * and `baseline` is the only number this gate cannot recompute — a file that
 * disagrees with itself stops the process before any rule is judged.
 */
export function parseExceptions(parsed: unknown, at: string): Exceptions {
  const problems: string[] = [];
  const file = parsed as Partial<Exceptions>;
  if (typeof file?.baseline !== "number" || !Array.isArray(file.entries))
    throw new Error(`${at}: needs a numeric baseline and an entries array`);
  for (const [index, entry] of file.entries.entries()) {
    const where = `entries[${index}]`;
    if (!isRule(entry?.rule))
      problems.push(
        `${where}.rule "${entry?.rule}" is not one of ${RULES.join(", ")}`,
      );
    if (typeof entry?.key !== "string" || !entry.key.trim())
      problems.push(`${where}.key must name the violation it excuses`);
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20)
      problems.push(
        `${where}.reason must say WHY parity stops here (20+ characters)`,
      );
    for (const extra of Object.keys(entry ?? {}))
      if (!["rule", "key", "reason"].includes(extra))
        problems.push(`${where}.${extra} is not a field of an exception`);
  }
  const identities = file.entries.map(identity);
  for (const [index, id] of identities.entries())
    if (identities.indexOf(id) !== index)
      problems.push(`entries[${index}] excuses ${id} a second time`);
  if (file.entries.length > file.baseline)
    problems.push(
      `${file.entries.length} entries exceed the ${file.baseline} baseline — raising it is a deliberate, reviewable diff`,
    );
  if (problems.length) throw new Error(`${at}:\n  ${problems.join("\n  ")}`);
  return { baseline: file.baseline, entries: file.entries };
}

const identity = (entry: { rule: Rule; key: string }): string =>
  `${entry.rule} ${entry.key}`;

/**
 * Judge one run: the report a reader gets, and every reason the process must
 * fail. Parity is a GATE, so an unexcused violation fails — and so does an
 * exception that no longer reproduces, because the wave that fixed the
 * violation is the one that has to delete its excuse. Leaving it behind would
 * let the next real violation of the same identity pass unseen.
 */
export function judge(
  violations: Violation[],
  exceptions: Exceptions,
  summary: string,
): Verdict {
  const excused = new Set(exceptions.entries.map(identity));
  const reproduced = new Set(violations.map(identity));
  const open = violations.filter((v) => !excused.has(identity(v)));
  const stale = exceptions.entries.filter((e) => !reproduced.has(identity(e)));

  const lines = [summary];
  for (const rule of RULES) {
    const found = open.filter((violation) => violation.rule === rule);
    lines.push(`\n${rule}: ${found.length}`);
    for (const violation of found.slice(0, 20))
      lines.push(`  ${violation.message}`);
    if (found.length > 20) lines.push(`  … ${found.length - 20} more`);
  }
  lines.push(
    `\nexceptions: ${exceptions.entries.length} of a ${exceptions.baseline} baseline, ${stale.length} stale`,
  );
  for (const entry of stale)
    lines.push(`  exception for ${entry.key} no longer applies — delete it`);

  return {
    report: `${lines.join("\n")}\n`,
    failures: [
      ...open.map(
        (violation) =>
          `${identity(violation)} is not excused — fix it, or add an entry with a written reason`,
      ),
      ...stale.map(
        (entry) =>
          `${identity(entry)} no longer reproduces — delete its exception and lower the baseline`,
      ),
    ],
  };
}
