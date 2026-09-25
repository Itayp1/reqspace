export class TtlCache<T> {
  private map = new Map<string, { value: T; expires: number }>();
  constructor(private ttlMs: number, private maxSize: number = 1000) {}
  
  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }
  
  set(key: string, value: T): void {
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
  
  delete(key: string): void {
    this.map.delete(key);
  }
}

export const roleCache = new TtlCache<{ role: string | null; isSuperAdmin: boolean }>(30000);