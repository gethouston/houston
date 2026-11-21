export class RingBuffer<T> {
  readonly capacity: number;
  #store: (T | undefined)[];
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

  get length(): number {
    return this.#length;
  }

  push(value: T): void {
    if (this.#length < this.capacity) {
      this.#store[(this.#head + this.#length) % this.capacity] = value;
      this.#length++;
      return;
    }
    this.#store[this.#head] = value;
    this.#head = (this.#head + 1) % this.capacity;
  }

  at(index: number): T | undefined {
    if (index < 0 || index >= this.#length) return undefined;
    return this.#store[(this.#head + index) % this.capacity];
  }

  sliceFrom(from: number): T[] {
    const start = from < 0 ? 0 : from;
    const out: T[] = [];
    for (let i = start; i < this.#length; i++) {
      out.push(this.#store[(this.#head + i) % this.capacity] as T);
    }
    return out;
  }

  clear(): void {
    this.#store = new Array<T | undefined>(this.capacity);
    this.#head = 0;
    this.#length = 0;
  }
}
