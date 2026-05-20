import type { SupportedLanguage } from "../localisation/languages";

export type TranscriptionRequest = {
  audioStoragePath: string;
  languageCode: SupportedLanguage;
};

export type TranscriptionResult = {
  rawText: string;
  languageCode: SupportedLanguage;
  provider: "not_configured" | "mock";
};

export async function transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResult> {
  return {
    rawText: "",
    languageCode: request.languageCode,
    provider: "not_configured",
  };
}
