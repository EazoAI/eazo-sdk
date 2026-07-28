function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key) || null : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] || null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return;
  if (window[name]) return;
  Object.defineProperty(window, name, {
    configurable: true,
    value: createMemoryStorage(),
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
