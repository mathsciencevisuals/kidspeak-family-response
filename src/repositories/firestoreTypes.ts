export type DocumentData = Record<string, unknown>;

export type CollectionRef<T extends DocumentData> = {
  name: string;
  converter?: FirestoreConverter<T>;
};

export type FirestoreConverter<T extends DocumentData> = {
  toFirestore(value: T): DocumentData;
  fromFirestore(value: DocumentData): T;
};

export type FirestoreClient = {
  list<T extends DocumentData>(collection: CollectionRef<T>): Promise<T[]>;
  get<T extends DocumentData>(collection: CollectionRef<T>, id: string): Promise<T | null>;
  set<T extends DocumentData>(collection: CollectionRef<T>, id: string, value: T): Promise<void>;
  query<T extends DocumentData>(
    collection: CollectionRef<T>,
    field: keyof T,
    operator: "==",
    value: unknown,
  ): Promise<T[]>;
};

export function collectionRef<T extends DocumentData>(name: string): CollectionRef<T> {
  return { name };
}
