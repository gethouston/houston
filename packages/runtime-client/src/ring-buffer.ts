/**
 * A fixed-capacity ring buffer: `push` is amortized O(1) and, once full,
 * overwrites the oldest element in place — no array `shift` (which re-indexes
 * the whole backing array on every call). Elements are presented in insertion
 * order: logical index 0 is the oldest still buffered.
 *
 * Deliberately tiny and generic (no seq/domain knowledge) so it can back any
 * fixed-size "last N in order" window; `ReplayLog` is its first user.
 */
export class RingBuffer<T> {
  readonly capacity: number;
  #store: (T | undefined)[];
  /** Backing index of logical element 0. */
  #head = 0;
  #length = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `RingBuffer capacity must be a positive integer, got ${capacity}`,
      );
    }
    this.capacity = capacity;
    this.#store = new Array<T | undefined>(capacity);
  }

  /** How many elements are currently buffered (0..capacity). */
  get length(): number {
    return this.#length;
  }

  /** Append; when full, drop (overwrite) the oldest element. */
  push(value: T): void {
    if (this.#length < this.capacity) {
      this.#store[(this.#head + this.#length) % this.capacity] = value;
      this.#length++;
      return;
    }
    // Full: overwrite the oldest and advance the window one step.
    this.#store[this.#head] = value;
    this.#head = (this.#head + 1) % this.capacity;
  }

  /** Logical element at `index` (0 = oldest), or undefined if out of range. */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.#length) return undefined;
    return this.#store[(this.#head + index) % this.capacity];
  }

  /** A fresh array of the elements from logical `from` (inclusive) onward. */
  sliceFrom(from: number): T[] {
    const start = from < 0 ? 0 : from;
    const out: T[] = [];
    for (let i = start; i < this.#length; i++) {
      out.push(this.#store[(this.#head + i) % this.capacity] as T);
    }
    return out;
  }

  /** Drop all elements (and release their references for GC). */
  clear(): void {
    this.#store = new Array<T | undefined>(this.capacity);
    this.#head = 0;
    this.#length = 0;
  }
}
