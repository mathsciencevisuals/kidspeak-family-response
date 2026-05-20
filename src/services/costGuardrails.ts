import { z } from "zod";

export const costGuardrailConfigSchema = z.object({
  maxAudioDurationSeconds: z.number().int().positive(),
  maxAudioFileMb: z.number().int().positive(),
  dailyAnalysisLimitPerFamily: z.number().int().positive(),
  dailyAiCostLimitSoft: z.number().nonnegative(),
  disableRealAi: z.boolean(),
  useMockTranscription: z.boolean(),
  useGeminiAnalysis: z.boolean(),
  audioRetentionDays: z.number().int().nonnegative(),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
});

export type CostGuardrailConfig = z.infer<typeof costGuardrailConfigSchema>;

export interface CostDashboardSnapshot {
  date: string;
  sessionsProcessedToday: number;
  totalAudioMinutesProcessed: number;
  aiCallsToday: number;
  failedJobs: number;
  estimatedCostUsdPlaceholder: number;
  familiesOverDailyLimit: Array<{ familyId: string; analysisCount: number; limit: number }>;
  guardrails: CostGuardrailConfig;
}

export function readCostGuardrails(): CostGuardrailConfig {
  return costGuardrailConfigSchema.parse({
    maxAudioDurationSeconds: numberEnv("MAX_AUDIO_DURATION_SECONDS", 300),
    maxAudioFileMb: numberEnv("MAX_AUDIO_FILE_MB", 25),
    dailyAnalysisLimitPerFamily: numberEnv("DAILY_ANALYSIS_LIMIT_PER_FAMILY", 20),
    dailyAiCostLimitSoft: numberEnv("DAILY_AI_COST_LIMIT_SOFT", 5),
    disableRealAi: booleanEnv("DISABLE_REAL_AI", true),
    useMockTranscription: booleanEnv("USE_MOCK_TRANSCRIPTION", true),
    useGeminiAnalysis: booleanEnv("USE_GEMINI_ANALYSIS", false),
    audioRetentionDays: numberEnv("AUDIO_RETENTION_DAYS", 7),
    logLevel: logLevelEnv(),
  });
}

export function getCostDashboardSnapshot(): CostDashboardSnapshot {
  const guardrails = readCostGuardrails();
  return {
    date: new Date().toISOString().slice(0, 10),
    sessionsProcessedToday: 0,
    totalAudioMinutesProcessed: 0,
    aiCallsToday: 0,
    failedJobs: 0,
    estimatedCostUsdPlaceholder: 0,
    familiesOverDailyLimit: [],
    guardrails,
  };
}

export function estimateUsage(input: {
  path: string;
  method: string;
  durationMs: number;
  audioSeconds?: number;
  textLength?: number;
}): {
  analysisDurationMs: number;
  estimatedAiTokens: number;
  estimatedAudioSeconds: number;
  aiCallLikely: boolean;
} {
  const aiCallLikely = /analysis|recommendations|localise|risk-assessment/.test(input.path);
  return {
    analysisDurationMs: input.durationMs,
    estimatedAiTokens: input.textLength ? Math.ceil(input.textLength / 4) : 0,
    estimatedAudioSeconds: input.audioSeconds ?? 0,
    aiCallLikely,
  };
}

function numberEnv(name: string, fallback: number): number {
  const raw = envValue(name);
  return raw ? Number(raw) : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = envValue(name);
  if (!raw) {
    return fallback;
  }
  return raw === "true" || raw === "1";
}

function logLevelEnv(): CostGuardrailConfig["logLevel"] {
  const raw = envValue("LOG_LEVEL") ?? "info";
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

function envValue(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}
