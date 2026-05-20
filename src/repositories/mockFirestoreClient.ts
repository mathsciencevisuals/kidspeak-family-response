import type { CollectionRef, DocumentData, FirestoreClient } from "./firestoreTypes";

export class InMemoryFirestoreClient implements FirestoreClient {
  private readonly records = new Map<string, Map<string, DocumentData>>();

  seed<T extends DocumentData>(collectionName: string, values: T[], getId: (value: T) => string): void {
    const collection = this.ensureCollection(collectionName);
    values.forEach((value) => collection.set(getId(value), value));
  }

  async list<T extends DocumentData>(collection: CollectionRef<T>): Promise<T[]> {
    return Array.from(this.ensureCollection(collection.name).values()) as T[];
  }

  async get<T extends DocumentData>(collection: CollectionRef<T>, id: string): Promise<T | null> {
    return (this.ensureCollection(collection.name).get(id) as T | undefined) ?? null;
  }

  async set<T extends DocumentData>(collection: CollectionRef<T>, id: string, value: T): Promise<void> {
    this.ensureCollection(collection.name).set(id, value);
  }

  async query<T extends DocumentData>(
    collection: CollectionRef<T>,
    field: keyof T,
    operator: "==",
    value: unknown,
  ): Promise<T[]> {
    if (operator !== "==") {
      throw new Error(`Unsupported mock Firestore operator: ${operator}`);
    }

    return Array.from(this.ensureCollection(collection.name).values()).filter(
      (record) => record[String(field)] === value,
    ) as T[];
  }

  private ensureCollection(name: string): Map<string, DocumentData> {
    const current = this.records.get(name);
    if (current) {
      return current;
    }

    const created = new Map<string, DocumentData>();
    this.records.set(name, created);
    return created;
  }
}
