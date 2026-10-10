interface Entry {
  expires: number;
  value: unknown;
}

/** 进程内缓存，避免重复请求同一地点或道路。 */
export class MemoryCache {
  private readonly store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}
