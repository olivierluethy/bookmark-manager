// Vitest runs with `environment: 'node'`, where `globalThis.localStorage`
// does not exist. Zustand's `persist` middleware falls back to logging a
// `console.warn` on every `set()` when its storage is unavailable, which
// pollutes test output. Installing a minimal in-memory stub here makes
// `persist` actually work under test instead of just silencing the warning.
class MemoryStorage implements Storage {
  #store = new Map<string, string>();

  get length(): number {
    return this.#store.size;
  }

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.has(key) ? this.#store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// zustand's `persist` middleware defaults to `createJSONStorage(() =>
// window.localStorage)`. The `node` test environment has no `window` global
// at all, so that lookup throws a ReferenceError before it ever reaches
// `localStorage` — triggering the "storage unavailable" fallback regardless
// of the stub above. Alias `window` to `globalThis` (as browsers effectively
// do) so `window.localStorage` resolves to the stub too.
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true,
  });
}
