import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sprint1StorageAdapter } from "../../repositories/storageAdapter";

export const aiCostLogSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  inputSize: z.number().int().nonnegative(),
  outputSize: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  purpose: z.string().min(1),
  provider: z.enum(["mock", "rule_based", "gemini", "speech_to_text"]),
  estimatedCost: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});

export type AiCostLog = z.infer<typeof aiCostLogSchema>;

export class AiCostLogger {
  constructor(private readonly storage: Sprint1StorageAdapter) {}

  async save(input: Omit<AiCostLog, "id" | "createdAt">): Promise<AiCostLog> {
    const log = aiCostLogSchema.parse({
      ...input,
      id: `ai_cost_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
    await this.storage.setJson(costLogKey(log.id), log);
    await this.storage.addToSet(sessionCostLogsKey(log.sessionId), log.id);
    await this.storage.addToSet(userCostLogsKey(log.userId), log.id);
    return log;
  }
}

export function estimateAiCost(input: {
  provider: AiCostLog["provider"];
  inputSize: number;
  outputSize: number;
}): number {
  if (input.provider === "mock" || input.provider === "rule_based") {
    return 0;
  }
  const tokenEstimate = Math.ceil((input.inputSize + input.outputSize) / 4);
  return Math.round(tokenEstimate * 0.0000005 * 100000) / 100000;
}

const costLogKey = (logId: string) => `aiCostLog:${logId}`;
const sessionCostLogsKey = (sessionId: string) => `session:${sessionId}:aiCostLogs`;
const userCostLogsKey = (userId: string) => `user:${userId}:aiCostLogs`;
