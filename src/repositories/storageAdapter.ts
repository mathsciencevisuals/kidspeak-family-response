import { GcpRedisAdapter, InMemoryRedisAdapter, type KeyValueSetAdapter } from "./redisAdapter";

export type StorageProvider = "redis" | "firebase" | "memory";

export type Sprint1StorageAdapter = KeyValueSetAdapter;

export class FirebaseStorageAdapter implements Sprint1StorageAdapter {
  private readonly projectId = process.env.GOOGLE_CLOUD_PROJECT;
  private readonly databaseId = process.env.FIRESTORE_DATABASE_ID ?? "(default)";

  async getJson<T>(key: string): Promise<T | null> {
    const response = await fetch(this.documentUrl("kv", key), {
      headers: await this.headers(),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Firestore get failed: ${response.status} ${await response.text()}`);
    }
    const document = await response.json() as FirestoreDocument;
    const raw = document.fields?.json?.stringValue;
    return raw ? JSON.parse(raw) as T : null;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    await this.patchDocument("kv", key, {
      fields: {
        json: { stringValue: JSON.stringify(value) },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    });
  }

  async deleteKey(key: string): Promise<void> {
    await fetch(this.documentUrl("kv", key), {
      method: "DELETE",
      headers: await this.headers(),
    });
  }

  async addToSet(key: string, value: string): Promise<void> {
    const values = new Set(await this.members(key));
    values.add(value);
    await this.patchDocument("sets", key, {
      fields: {
        values: {
          arrayValue: {
            values: Array.from(values).map((item) => ({ stringValue: item })),
          },
        },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    });
  }

  async removeFromSet(key: string, value: string): Promise<void> {
    const values = (await this.members(key)).filter((item) => item !== value);
    await this.patchDocument("sets", key, {
      fields: {
        values: {
          arrayValue: {
            values: values.map((item) => ({ stringValue: item })),
          },
        },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    });
  }

  async members(key: string): Promise<string[]> {
    const response = await fetch(this.documentUrl("sets", key), {
      headers: await this.headers(),
    });
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`Firestore set read failed: ${response.status} ${await response.text()}`);
    }
    const document = await response.json() as FirestoreDocument;
    return document.fields?.values?.arrayValue?.values?.map((item) => item.stringValue ?? "").filter(Boolean) ?? [];
  }

  private async patchDocument(collection: "kv" | "sets", key: string, body: FirestoreDocument): Promise<void> {
    const response = await fetch(this.documentUrl(collection, key), {
      method: "PATCH",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Firestore write failed: ${response.status} ${await response.text()}`);
    }
  }

  private documentUrl(collection: "kv" | "sets", key: string): string {
    if (!this.projectId) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for STORAGE_PROVIDER=firebase.");
    }
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents/kidspeak_${collection}/${encodeKey(key)}`;
  }

  private async headers(): Promise<HeadersInit> {
    return {
      authorization: `Bearer ${await metadataAccessToken()}`,
      "content-type": "application/json",
    };
  }
}

export async function createSprint1StorageAdapter(): Promise<Sprint1StorageAdapter> {
  const provider = getStorageProvider();

  if (provider === "memory") {
    return new InMemoryRedisAdapter();
  }

  if (provider === "firebase") {
    return new FirebaseStorageAdapter();
  }

  if (!process.env.REDIS_URL) {
    return new InMemoryRedisAdapter();
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (error) => {
    console.error("Redis client error", error);
  });
  await client.connect();
  return new GcpRedisAdapter(client);
}

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ??
    (process.env.ENABLE_REDIS === "true" ? "redis" : process.env.NODE_ENV === "production" ? "firebase" : "memory");

  if (provider === "redis" || provider === "firebase" || provider === "memory") {
    return provider;
  }

  throw new Error(`Unsupported STORAGE_PROVIDER "${provider}". Use redis, firebase, or memory.`);
}

type FirestoreDocument = {
  fields?: {
    json?: { stringValue?: string };
    values?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
    updatedAt?: { timestampValue?: string };
  };
};

async function metadataAccessToken(): Promise<string> {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) {
    throw new Error(
      "Could not fetch Cloud Run metadata token for Firestore. Use STORAGE_PROVIDER=memory locally or run on GCP with Firestore permissions.",
    );
  }
  const body = await response.json() as { access_token: string };
  return body.access_token;
}

function encodeKey(key: string): string {
  return Buffer.from(key).toString("base64url");
}
