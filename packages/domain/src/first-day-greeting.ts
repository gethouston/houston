export type SetupGreetingVariant = "text" | "textWithRole" | "textRoleAsName";

export interface SetupGreetingCopy {
  variant: SetupGreetingVariant;
  params: { name: string; role?: string };
}

export function roleInSentence(role: string): string {
  const trimmed = role.trim();
  const firstWord = trimmed.split(/\s+/, 1)[0] ?? "";
  const isAcronym =
    firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  if (isAcronym) return trimmed;
  return trimmed.charAt(0).toLocaleLowerCase() + trimmed.slice(1);
}

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
