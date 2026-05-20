import type { SaveAudioUploadInput } from "../types/sprint1";

export type StoredAudioObject = {
  storagePath: string | null;
  retentionDays: number;
  audioPersisted: boolean;
};

export const audioUploadConfig = {
  maxDurationSeconds: Number(process.env.AUDIO_MAX_DURATION_SECONDS ?? 300),
  maxFileSizeBytes: Number(process.env.AUDIO_MAX_FILE_SIZE_BYTES ?? 25 * 1024 * 1024),
  retentionDays: Number(process.env.AUDIO_RETENTION_DAYS ?? 1),
  bucketName: process.env.AUDIO_BUCKET_NAME ?? "kidspeak-raw-audio-local",
};

export const storeRawAudioEnabled = () => process.env.STORE_RAW_AUDIO === "true";

export function validateAudioUpload(input: SaveAudioUploadInput): void {
  if (input.estimatedDurationSeconds > audioUploadConfig.maxDurationSeconds) {
    throw new Error(`Audio duration exceeds ${audioUploadConfig.maxDurationSeconds} seconds.`);
  }

  if (input.fileSizeBytes > audioUploadConfig.maxFileSizeBytes) {
    throw new Error(`Audio file size exceeds ${audioUploadConfig.maxFileSizeBytes} bytes.`);
  }
}

export async function storeAudioUpload(input: SaveAudioUploadInput): Promise<StoredAudioObject> {
  validateAudioUpload(input);
  if (!storeRawAudioEnabled()) {
    return {
      storagePath: null,
      retentionDays: 0,
      audioPersisted: false,
    };
  }
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  return {
    storagePath: `gs://${audioUploadConfig.bucketName}/raw-audio/${input.sessionId}/${safeFileName}`,
    retentionDays: audioUploadConfig.retentionDays,
    audioPersisted: true,
  };
}
