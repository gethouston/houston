import { parse as parseYaml } from "yaml";

export interface SkillFrontmatter {
  title: string | null;
  description: string;
  integrations: string[];
  image: string | null;
  category: string | null;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || v instanceof Date) return String(v);
  return null;
};

const EMPTY: SkillFrontmatter = {
  title: null,
  description: "",
  integrations: [],
  image: null,
  category: null,
};

export function parseSkillFrontmatter(body: string): SkillFrontmatter {
  const m = body.match(FM);
  if (!m) return { ...EMPTY };

  let fm: Record<string, unknown>;
  try {
    const parsed = parseYaml(m[1] ?? "") as unknown;
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY };
    fm = parsed as Record<string, unknown>;
  } catch {
    return { ...EMPTY };
  }

  return {
    title: str(fm.title),
    description: str(fm.description) ?? "",
    integrations: Array.isArray(fm.integrations)
      ? fm.integrations.map(String)
      : [],
    image: str(fm.image),
    category: str(fm.category),
  };
}
