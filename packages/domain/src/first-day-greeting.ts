/**
 * Which sentence an AI Employee's first-day hello says, and its English text.
 *
 * The chat renders the hello from `chat:setupGreeting.<variant>`; the hidden
 * first-day prompt (`first-day-prompt.ts`) quotes {@link englishSetupGreeting}
 * back to the model so it knows the user already read it. Both pick the
 * variant here, and the app's `tests/setup-greeting-copy.test.ts` pins the
 * English text to the en locale word for word, so the quote and the rendered
 * hello cannot drift apart. The host builds the prompt and the app renders the
 * hello, so this lives where both reach it.
 */

/** The `chat:setupGreeting.*` key the hello renders. */
export type SetupGreetingVariant = "text" | "textWithRole" | "textRoleAsName";

export interface SetupGreetingCopy {
  variant: SetupGreetingVariant;
  params: { name: string; role?: string };
}

/**
 * A job title as it reads mid-sentence: "Executive assistant" becomes
 * "executive assistant". A leading acronym ("CFO", "HR manager") keeps its
 * case, since lowercasing it would misspell it.
 */
export function roleInSentence(role: string): string {
  const trimmed = role.trim();
  const firstWord = trimmed.split(/\s+/, 1)[0] ?? "";
  const isAcronym =
    firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  if (isAcronym) return trimmed;
  return trimmed.charAt(0).toLocaleLowerCase() + trimmed.slice(1);
}

/**
 * The hello's shape for this name and job. An AI Employee still named after its
 * job (a basic-team hire called "Executive assistant") introduces itself by the
 * job alone: "I'm Executive assistant, your executive assistant" repeats itself.
 */
export function setupGreetingVariant(
  name: string,
  role: string | null,
): SetupGreetingVariant {
  const job = role?.trim();
  if (!job) return "text";
  return name.trim().toLowerCase() === job.toLowerCase()
    ? "textRoleAsName"
    : "textWithRole";
}

/** The locale key and interpolation values for the hello. */
export function setupGreetingCopy(
  name: string,
  role: string | null,
): SetupGreetingCopy {
  const variant = setupGreetingVariant(name, role);
  if (variant === "text" || !role) return { variant: "text", params: { name } };
  return { variant, params: { name, role: roleInSentence(role) } };
}

const REST = [
  "Together we'll write down how I do my everyday work. In Houston, these step-by-step procedures are called **Skills**.",
  "Let's start with **one task you do every day**. We'll do it together once, then I'll save it as a Skill so I can do it for you anytime.",
  "Here are a few tasks we could start with:",
];

const FIRST_DAY =
  "Today is my *first day*, so help me learn how I can be most useful to you.";

/** The hello exactly as the en locale renders it for this name and job. */
export function englishSetupGreeting(
  name: string,
  role: string | null,
): string {
  const { variant, params } = setupGreetingCopy(name, role);
  const intro: Record<SetupGreetingVariant, string> = {
    text: `Hi, I'm **${params.name}**!`,
    textWithRole: `Hi, I'm **${params.name}**, your ${params.role}!`,
    textRoleAsName: `Hi, I'm your **${params.role}**!`,
  };
  return [`${intro[variant]} ${FIRST_DAY}`, ...REST].join("\n\n");
}
