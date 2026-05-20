import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sprint1StorageAdapter } from "../../repositories/storageAdapter";

export const analysisJobSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  jobType: z.enum(["transcription", "risk", "graph", "recommendation", "summary"]),
  status: z.enum(["queued", "running", "complete", "failed"]),
  provider: z.enum(["mock", "rule_based", "gemini", "speech_to_text"]),
  inputHash: z.string().min(1),
  outputCachePath: z.string().optional(),
  estimatedCost: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const analysisCacheEntrySchema = z.object({
  key: z.string().min(1),
  sessionId: z.string().min(1),
  jobType: analysisJobSchema.shape.jobType,
  inputHash: z.string().min(1),
  analysisVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  provider: analysisJobSchema.shape.provider,
  output: z.unknown(),
});

export type AnalysisJob = z.infer<typeof analysisJobSchema>;
export type AnalysisCacheEntry = z.infer<typeof analysisCacheEntrySchema>;
export type AnalysisJobType = AnalysisJob["jobType"];
export type AnalysisProvider = AnalysisJob["provider"];

export const ANALYSIS_VERSION = "family-response-intelligence-v11";

export function createInputHash(input: {
  transcript: string;
  situationType: string;
  childAgeRange: string;
  analysisVersion?: string;
}): string {
  const normalized = [
    input.transcript.trim().replace(/\s+/g, " ").toLowerCase(),
    input.situationType,
    input.childAgeRange,
    input.analysisVersion ?? ANALYSIS_VERSION,
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export class AnalysisCache {
  constructor(private readonly storage: Sprint1StorageAdapter) {}

  async get<T>(jobType: AnalysisJobType, inputHash: string): Promise<AnalysisCacheEntry & { output: T } | null> {
    const entry = await this.storage.getJson<AnalysisCacheEntry>(cacheKey(jobType, inputHash));
    return entry ? analysisCacheEntrySchema.parse(entry) as AnalysisCacheEntry & { output: T } : null;
  }

  async set(input: {
    sessionId: string;
    jobType: AnalysisJobType;
    inputHash: string;
    provider: AnalysisProvider;
    output: unknown;
    analysisVersion?: string;
  }): Promise<AnalysisCacheEntry> {
    const entry = analysisCacheEntrySchema.parse({
      key: cacheKey(input.jobType, input.inputHash),
      sessionId: input.sessionId,
      jobType: input.jobType,
      inputHash: input.inputHash,
      analysisVersion: input.analysisVersion ?? ANALYSIS_VERSION,
      generatedAt: new Date().toISOString(),
      provider: input.provider,
      output: input.output,
    });
    await this.storage.setJson(entry.key, entry);
    return entry;
  }

  async createJob(input: {
    sessionId: string;
    jobType: AnalysisJobType;
    provider: AnalysisProvider;
    inputHash: string;
    estimatedCost?: number;
  }): Promise<AnalysisJob> {
    const now = new Date().toISOString();
    const job = analysisJobSchema.parse({
      id: `analysis_job_${randomUUID()}`,
      sessionId: input.sessionId,
      jobType: input.jobType,
      status: "queued",
      provider: input.provider,
      inputHash: input.inputHash,
      estimatedCost: input.estimatedCost ?? 0,
      createdAt: now,
    });
    await this.storage.setJson(jobKey(job.id), job);
    await this.storage.addToSet(sessionJobsKey(job.sessionId), job.id);
    return job;
  }

  async completeJob(job: AnalysisJob, outputCachePath: string): Promise<AnalysisJob> {
    const completed = analysisJobSchema.parse({
      ...job,
      status: "complete",
      outputCachePath,
      completedAt: new Date().toISOString(),
    });
    await this.storage.setJson(jobKey(completed.id), completed);
    return completed;
  }
}

export function cacheMetadata(entry: AnalysisCacheEntry | null): {
  cached: boolean;
  generatedAt?: string;
  analysisVersion: string;
} {
  return {
    cached: Boolean(entry),
    generatedAt: entry?.generatedAt,
    analysisVersion: entry?.analysisVersion ?? ANALYSIS_VERSION,
  };
}

const cacheKey = (jobType: AnalysisJobType, inputHash: string) => `analysisCache:${jobType}:${inputHash}`;
const jobKey = (jobId: string) => `analysisJob:${jobId}`;
const sessionJobsKey = (sessionId: string) => `session:${sessionId}:analysisJobs`;
