export type KeyValueSetAdapter = {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T): Promise<void>;
  deleteKey(key: string): Promise<void>;
  addToSet(key: string, value: string): Promise<void>;
  removeFromSet(key: string, value: string): Promise<void>;
  members(key: string): Promise<string[]>;
};

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sAdd(key: string, value: string): Promise<unknown>;
  sRem(key: string, value: string): Promise<unknown>;
  sMembers(key: string): Promise<string[]>;
  on(event: "error", listener: (error: Error) => void): unknown;
  connect(): Promise<unknown>;
};

export class InMemoryRedisAdapter implements KeyValueSetAdapter {
  private readonly values = new Map<string, unknown>();
  private readonly sets = new Map<string, Set<string>>();

  async getJson<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async deleteKey(key: string): Promise<void> {
    this.values.delete(key);
    this.sets.delete(key);
  }

  async addToSet(key: string, value: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(value);
    this.sets.set(key, set);
  }

  async members(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async removeFromSet(key: string, value: string): Promise<void> {
    this.sets.get(key)?.delete(value);
  }
}

export class GcpRedisAdapter implements KeyValueSetAdapter {
  constructor(private readonly client: RedisClient) {}

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async deleteKey(key: string): Promise<void> {
    await this.client.del(key);
  }

  async addToSet(key: string, value: string): Promise<void> {
    await this.client.sAdd(key, value);
  }

  async removeFromSet(key: string, value: string): Promise<void> {
    await this.client.sRem(key, value);
  }

  async members(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }
}
