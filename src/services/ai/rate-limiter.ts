import { z } from "zod";
import type { Sprint1StorageAdapter } from "../../repositories/storageAdapter";
import { readCostGuardrails } from "../costGuardrails";

export const rateLimitPurposeSchema = z.enum([
  "family_analysis",
  "therapist_export",
  "ai_personalization",
]);

export type RateLimitPurpose = z.infer<typeof rateLimitPurposeSchema>;

export type RateLimitResult = {
  allowed: boolean;
  key: string;
  count: number;
  limit: number;
  adminOverride: boolean;
};

export class RateLimiter {
  constructor(private readonly storage: Sprint1StorageAdapter) {}

  async checkAndIncrement(input: {
    familyId: string;
    purpose: RateLimitPurpose;
    adminOverride?: boolean;
  }): Promise<RateLimitResult> {
    const limit = limitFor(input.purpose);
    const key = rateLimitKey(input.familyId, input.purpose);
    const current = await this.storage.getJson<{ count: number; date: string }>(key);
    const today = currentDate();
    const count = current?.date === today ? current.count : 0;

    if (input.adminOverride) {
      await this.storage.setJson(key, { count, date: today });
      return { allowed: true, key, count, limit, adminOverride: true };
    }

    if (count >= limit) {
      return { allowed: false, key, count, limit, adminOverride: false };
    }

    const nextCount = count + 1;
    await this.storage.setJson(key, { count: nextCount, date: today });
    return { allowed: true, key, count: nextCount, limit, adminOverride: false };
  }
}

export function limitFor(purpose: RateLimitPurpose): number {
  const guardrails = readCostGuardrails();
  if (purpose === "family_analysis") {
    return guardrails.dailyAnalysisLimitPerFamily;
  }
  if (purpose === "therapist_export") {
    return Number(process.env.DAILY_THERAPIST_EXPORT_LIMIT ?? 20);
  }
  return Number(process.env.DAILY_AI_PERSONALIZATION_LIMIT ?? 10);
}

function rateLimitKey(familyId: string, purpose: RateLimitPurpose): string {
  return `rateLimit:${currentDate()}:${familyId}:${purpose}`;
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
