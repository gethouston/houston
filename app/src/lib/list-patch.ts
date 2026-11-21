type Absent = null | undefined;

export function withoutItems<T>(list: T[], drop: (item: T) => boolean): T[];
export function withoutItems<T, A extends Absent>(
  list: T[] | A,
  drop: (item: T) => boolean,
): T[] | A;
export function withoutItems<T>(
  list: T[] | Absent,
  drop: (item: T) => boolean,
): T[] | Absent {
  if (!list?.some(drop)) return list;
  return list.filter((item) => !drop(item));
}

export function mapItem<T>(
  list: T[],
  match: (item: T) => boolean,
  edit: (item: T) => T,
): T[];
export function mapItem<T, A extends Absent>(
  list: T[] | A,
  match: (item: T) => boolean,
  edit: (item: T) => T,
): T[] | A;
export function mapItem<T>(
  list: T[] | Absent,
  match: (item: T) => boolean,
  edit: (item: T) => T,
): T[] | Absent {
  if (!list) return list;
  let changed = false;
  const next = list.map((item) => {
    if (!match(item)) return item;
    const edited = edit(item);
    if (edited !== item) changed = true;
    return edited;
  });
  return changed ? next : list;
}
