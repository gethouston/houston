const MAX_ENTRIES = 32;

export class OrgHistory {
  private readonly entries: Array<{ since: number; slug: string | null }> = [];

  set(slug: string | null, at: number): void {
    if (this.entries.at(-1)?.slug === slug) return;
    this.entries.push({ since: at, slug });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  at(at: number): string | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry && entry.since <= at) return entry.slug;
    }
    return null;
  }
}
