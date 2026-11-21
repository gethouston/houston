export const PERSON_TONE_CLASSES = [
  "bg-person-slate",
  "bg-person-sage",
  "bg-person-mauve",
  "bg-person-taupe",
  "bg-person-indigo",
] as const;

export type PersonToneClass = (typeof PERSON_TONE_CLASSES)[number];

export function personToneIndex(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % PERSON_TONE_CLASSES.length;
}

export function personToneClass(id: string): PersonToneClass {
  return PERSON_TONE_CLASSES[personToneIndex(id)];
}

export const PERSON_NAME_TONE_CLASSES = [
  "text-person-name-slate",
  "text-person-name-sage",
  "text-person-name-mauve",
  "text-person-name-taupe",
  "text-person-name-indigo",
] as const;

export type PersonNameToneClass = (typeof PERSON_NAME_TONE_CLASSES)[number];

export function personNameToneClass(id: string): PersonNameToneClass {
  return PERSON_NAME_TONE_CLASSES[personToneIndex(id)];
}
