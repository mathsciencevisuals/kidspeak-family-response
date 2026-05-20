import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRedisAdapter } from "../repositories/redisAdapter";
import { Sprint1Repository } from "../repositories/sprint1Repository";

test("audioStoragePath remains null when STORE_RAW_AUDIO=false", async () => {
  process.env.STORE_RAW_AUDIO = "false";
  const storage = new InMemoryRedisAdapter();
  const repository = new Sprint1Repository(storage);
  const session = await repository.createSession({
    familyId: "family-audio-test",
    childId: "child-audio-test",
    createdByUserId: "parent-audio-test",
    situationType: "homework_conflict",
    language: "en-IN",
    durationSeconds: 30,
    transcriptStatus: "not_started",
    riskLevel: "low",
    overallPattern: "audio transient test",
    inputMode: "uploaded_audio_transient",
  });

  const upload = await repository.saveAudioUpload({
    sessionId: session.id,
    fileName: "transient.m4a",
    mimeType: "audio/m4a",
    fileSizeBytes: 1024,
    estimatedDurationSeconds: 20,
  });
  const updated = await repository.getSession(session.id);

  assert.equal(upload.audioPersisted, false);
  assert.equal(upload.storagePath, null);
  assert.equal(updated?.audioStoragePath, null);

  const eventIds = await storage.members(`session:${session.id}:audioProcessingEvents`);
  assert.equal(eventIds.length, 1);
  const event = await storage.getJson<{ audioPersisted: boolean; storagePath: string | null }>(`audioProcessingEvent:${eventIds[0]}`);
  assert.equal(event?.audioPersisted, false);
  assert.equal(event?.storagePath, null);
});
