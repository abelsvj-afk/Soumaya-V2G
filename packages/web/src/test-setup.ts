// Polyfill localStorage on globalThis for vitest + happy-dom environment
// Override Node's experimental native localStorage by deleting it first

const mockStorage: any = {
  _data: {} as Record<string, string>,
  getItem(key: string) { return this._data[key] ?? null; },
  setItem(key: string, val: string) { this._data[key] = String(val); },
  removeItem(key: string) { delete this._data[key]; },
  clear() { this._data = {}; },
  key(index: number) { return Object.keys(this._data)[index] ?? null; },
  get length() { return Object.keys(this._data).length; }
};

if (typeof window !== "undefined") {
  if (!window.localStorage) {
    try {
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      (window as any).localStorage = mockStorage;
    }
  }
}

try {
  delete (globalThis as any).localStorage;
} catch (e) {
  // Ignore error
}

try {
  Object.defineProperty(globalThis, "localStorage", {
    value: typeof window !== "undefined" && window.localStorage ? window.localStorage : mockStorage,
    writable: true,
    configurable: true,
  });
} catch (e) {
  try {
    (globalThis as any).localStorage = typeof window !== "undefined" && window.localStorage ? window.localStorage : mockStorage;
  } catch (e2) {
    // Ignore
  }
}
