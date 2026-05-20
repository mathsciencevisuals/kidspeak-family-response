import { z } from "zod";
import { assessSafetyRisk } from "./safetyRiskClassifier";
import type { ConversationTurn } from "../types/sprint1";
import type { LiveCoachNudge } from "../types/domain";

export const liveCoachSimulatePayloadSchema = z.object({
  transcriptLine: z.string().min(1),
  speaker: z.enum(["parent", "child", "unknown"]).default("unknown"),
  consentGranted: z.boolean().default(false),
});

export const liveCoachChunkPayloadSchema = z.object({
  chunkDurationSeconds: z.number().min(1).max(30).default(15),
  transcriptPreview: z.string().optional(),
  consentGranted: z.boolean().default(false),
});

export type LiveCoachSimulationResult = {
  experimental: true;
  enabled: false;
  recordingIndicatorVisible: true;
  detectedPattern: string;
  nudge: LiveCoachNudge | null;
  safetyStop: boolean;
  safetyGuidance?: string;
  sessionSummary: string;
};

const liveCoachAudioEnabled = () => process.env.LIVE_COACH_AUDIO_ENABLED === "true";
const chunkDurationSeconds = () => Number(process.env.LIVE_COACH_CHUNK_SECONDS ?? 15);

const rules: Array<{
  pattern: string;
  speaker: "parent" | "child" | "unknown";
  phrases: string[];
  nudgeText: string;
  target: "parent" | "child";
  severity: LiveCoachNudge["severity"];
}> = [
  {
    pattern: "parent_voice_rising",
    speaker: "parent",
    phrases: ["shouting", "loud", "angry voice", "voice rising", "yelling"],
    nudgeText: "Pause. Lower voice. Ask one curious question.",
    target: "parent",
    severity: "medium",
  },
  {
    pattern: "parent_blame",
    speaker: "parent",
    phrases: ["always lazy", "useless", "never listen", "your fault"],
    nudgeText: "Replace label with observation.",
    target: "parent",
    severity: "medium",
  },
  {
    pattern: "child_shutdown",
    speaker: "child",
    phrases: ["leave me alone", "i don't care", "i do not care", "stop talking", "nothing"],
    nudgeText: "Validate first: 'I can see this feels hard.'",
    target: "parent",
    severity: "medium",
  },
  {
    pattern: "conflict_escalating",
    speaker: "unknown",
    phrases: ["both shouting", "getting worse", "fight", "arguing more"],
    nudgeText: "Take a 2-minute pause before continuing.",
    target: "parent",
    severity: "high",
  },
];

export function simulateLiveCoach(input: z.infer<typeof liveCoachSimulatePayloadSchema>): LiveCoachSimulationResult {
  if (!input.consentGranted) {
    return {
      experimental: true,
      enabled: false,
      recordingIndicatorVisible: true,
      detectedPattern: "consent_required",
      nudge: null,
      safetyStop: false,
      sessionSummary: "Live coaching requires explicit consent and a visible recording indicator.",
    };
  }

  const turn = turnFromLine(input.transcriptLine, input.speaker);
  const risk = assessSafetyRisk("live-coach-simulation", [turn]);
  if (risk.blockNormalCoaching) {
    return {
      experimental: true,
      enabled: false,
      recordingIndicatorVisible: true,
      detectedPattern: "safety_stop",
      nudge: null,
      safetyStop: true,
      safetyGuidance: "This conversation contains concerning language that may require immediate adult or professional attention.",
      sessionSummary: "Live coaching stopped because safety review is recommended.",
    };
  }

  const matchedRule = rules.find((rule) =>
    (rule.speaker === input.speaker || rule.speaker === "unknown") &&
    rule.phrases.some((phrase) => input.transcriptLine.toLowerCase().includes(phrase)),
  );

  const nudge = matchedRule ? createNudge(matchedRule.pattern, matchedRule.nudgeText, matchedRule.target, matchedRule.severity) : null;

  return {
    experimental: true,
    enabled: false,
    recordingIndicatorVisible: true,
    detectedPattern: matchedRule?.pattern ?? "no_nudge",
    nudge,
    safetyStop: false,
    sessionSummary: nudge
      ? "Rule-based simulation produced one parent coaching nudge."
      : "No live nudge was needed for this line.",
  };
}

export function analyzeLiveCoachChunk(input: z.infer<typeof liveCoachChunkPayloadSchema>) {
  if (!liveCoachAudioEnabled()) {
    return {
      experimental: true,
      audioEnabled: false,
      accepted: false,
      reason: "Real audio is disabled unless LIVE_COACH_AUDIO_ENABLED=true.",
      configuredChunkDurationSeconds: chunkDurationSeconds(),
    };
  }
  if (!input.consentGranted) {
    return {
      experimental: true,
      audioEnabled: true,
      accepted: false,
      reason: "Explicit consent is required before delayed live audio analysis.",
      configuredChunkDurationSeconds: chunkDurationSeconds(),
    };
  }

  return {
    experimental: true,
    audioEnabled: true,
    accepted: true,
    architecture: "Browser audio chunk -> Cloud Run -> rule-based fast classifier -> optional cached deeper suggestion.",
    configuredChunkDurationSeconds: chunkDurationSeconds(),
    result: input.transcriptPreview
      ? simulateLiveCoach({ transcriptLine: input.transcriptPreview, speaker: "unknown", consentGranted: true })
      : null,
  };
}

export function getLiveCoachSettings() {
  return {
    experimental: true,
    enabledByDefault: false,
    simulationModeDefault: true,
    liveCoachAudioEnabled: liveCoachAudioEnabled(),
    chunkDurationSeconds: chunkDurationSeconds(),
    dailySessionLimit: Number(process.env.LIVE_COACH_DAILY_SESSION_LIMIT ?? 5),
    storageDefault: "No continuous storage unless user opts in.",
    realTimeArchitecture: [
      "Browser audio chunks",
      "WebSocket or Server-Sent Events",
      "Cloud Run service",
      "Rule-based fast classifier first",
      "LLM only for occasional deeper suggestions",
    ],
  };
}

function createNudge(
  triggerPattern: string,
  nudgeText: string,
  target: "parent" | "child",
  severity: LiveCoachNudge["severity"],
): LiveCoachNudge {
  return {
    id: `live_nudge_${randomUUID()}`,
    timestamp: new Date().toISOString(),
    triggerPattern,
    nudgeText,
    target,
    severity,
    source: "rule_based",
  };
}

function turnFromLine(text: string, speaker: "parent" | "child" | "unknown"): ConversationTurn {
  return {
    id: `live_turn_${randomUUID()}`,
    sessionId: "live-coach-simulation",
    speaker,
    startTimeSec: 0,
    endTimeSec: 1,
    text,
    emotionLabel: "unknown",
    toneLabel: "unknown",
    intentLabel: "unknown",
    conversationAct: "live_simulation",
    escalationScore: 0,
    repairOpportunity: "",
    suggestedReframe: "",
  };
}

function randomUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
