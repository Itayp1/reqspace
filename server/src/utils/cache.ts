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
  deleteByPrefix(prefix: string): void {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }
}

export const workspaceRoleCache = new TtlCache<string | null>(30000);
export const superAdminCache = new TtlCache<boolean>(30000);export const systemConfigCache = new TtlCache<any>(30000);
