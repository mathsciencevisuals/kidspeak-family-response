import { z } from "zod";
import type { ConversationTurn } from "../types/sprint1";

export const riskCategorySchema = z.enum([
  "self_harm",
  "harm_to_others",
  "abuse_disclosure",
  "severe_fear",
  "violence",
  "severe_hopelessness",
  "parent_aggression",
  "child_extreme_distress",
]);

export const riskAssessmentSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  createdAt: z.string().datetime(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  riskCategories: z.array(riskCategorySchema),
  detectedPhrases: z.array(z.string()),
  explanation: z.string(),
  recommendedAction: z.string(),
  blockNormalCoaching: z.boolean(),
  requireProfessionalReview: z.boolean(),
  geminiSafetyAnalysisUsed: z.boolean(),
  uncertainty: z.enum(["low", "medium", "high"]),
});

export type RiskCategory = z.infer<typeof riskCategorySchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

type PhraseRule = {
  phrase: string;
  categories: RiskCategory[];
  severity: RiskAssessment["riskLevel"];
};

const highRiskRules: PhraseRule[] = [
  { phrase: "I want to die", categories: ["self_harm", "child_extreme_distress"], severity: "critical" },
  { phrase: "I want to disappear", categories: ["self_harm", "severe_hopelessness", "child_extreme_distress"], severity: "high" },
  { phrase: "I will hurt myself", categories: ["self_harm", "child_extreme_distress"], severity: "critical" },
  { phrase: "nobody loves me", categories: ["self_harm", "severe_hopelessness", "child_extreme_distress"], severity: "high" },
  { phrase: "I hate myself", categories: ["self_harm", "severe_hopelessness", "child_extreme_distress"], severity: "high" },
  { phrase: "I do not want to live", categories: ["self_harm", "child_extreme_distress"], severity: "critical" },
  { phrase: "I will hurt him", categories: ["harm_to_others", "violence"], severity: "critical" },
  { phrase: "I will hurt her", categories: ["harm_to_others", "violence"], severity: "critical" },
  { phrase: "I will kill", categories: ["harm_to_others", "violence"], severity: "critical" },
  { phrase: "I want to hit badly", categories: ["harm_to_others", "violence"], severity: "high" },
  { phrase: "he hits me", categories: ["abuse_disclosure", "violence"], severity: "high" },
  { phrase: "she touches me", categories: ["abuse_disclosure"], severity: "high" },
  { phrase: "I am scared to go home", categories: ["abuse_disclosure", "severe_fear"], severity: "high" },
  { phrase: "don't tell anyone", categories: ["abuse_disclosure", "severe_fear"], severity: "high" },
  { phrase: "don’t tell anyone", categories: ["abuse_disclosure", "severe_fear"], severity: "high" },
  { phrase: "they will beat me", categories: ["abuse_disclosure", "severe_fear", "violence"], severity: "high" },
  { phrase: "I will hit you", categories: ["parent_aggression", "violence"], severity: "high" },
  { phrase: "get out of the house", categories: ["parent_aggression", "severe_fear"], severity: "high" },
  { phrase: "I will break your bones", categories: ["parent_aggression", "violence"], severity: "critical" },
  { phrase: "I wish you were not born", categories: ["parent_aggression", "child_extreme_distress"], severity: "high" },
];

const mediumConcernPhrases = ["I am scared", "I cannot handle this", "please stop", "leave me alone"];

export function assessSafetyRisk(
  sessionId: string,
  turns: ConversationTurn[],
  options: { geminiSafetyAnalysisEnabled?: boolean } = {},
): RiskAssessment {
  const matches = turns.flatMap((turn) => matchTurn(turn));
  const riskCategories = unique(matches.flatMap((match) => match.categories));
  const detectedPhrases = unique(matches.map((match) => match.phrase));
  const highestRuleLevel = highestRiskLevel(matches.map((match) => match.severity));
  const mediumConcernDetected = matches.length === 0 && turns.some((turn) => includesAny(turn.text, mediumConcernPhrases));
  const riskLevel = highestRuleLevel ?? (mediumConcernDetected ? "medium" : "low");
  const uncertainty = riskLevel === "medium" ? "high" : matches.length > 0 ? "low" : "medium";
  const geminiSafetyAnalysisUsed = Boolean(options.geminiSafetyAnalysisEnabled && uncertainty === "high");

  return riskAssessmentSchema.parse({
    id: `risk_assessment_${crypto.randomUUID()}`,
    sessionId,
    createdAt: new Date().toISOString(),
    riskLevel,
    riskCategories,
    detectedPhrases,
    explanation: buildExplanation(riskLevel, riskCategories, geminiSafetyAnalysisUsed),
    recommendedAction: recommendedAction(riskLevel),
    blockNormalCoaching: riskLevel === "high" || riskLevel === "critical",
    requireProfessionalReview: riskLevel === "high" || riskLevel === "critical",
    geminiSafetyAnalysisUsed,
    uncertainty,
  });
}

function matchTurn(turn: ConversationTurn): PhraseRule[] {
  return highRiskRules.filter((rule) => normalized(turn.text).includes(normalized(rule.phrase)));
}

function includesAny(text: string, phrases: string[]): boolean {
  const normalizedText = normalized(text);
  return phrases.some((phrase) => normalizedText.includes(normalized(phrase)));
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function highestRiskLevel(levels: RiskAssessment["riskLevel"][]): RiskAssessment["riskLevel"] | null {
  if (levels.includes("critical")) {
    return "critical";
  }
  if (levels.includes("high")) {
    return "high";
  }
  if (levels.includes("medium")) {
    return "medium";
  }
  return levels.includes("low") ? "low" : null;
}

function buildExplanation(
  riskLevel: RiskAssessment["riskLevel"],
  categories: RiskCategory[],
  geminiSafetyAnalysisUsed: boolean,
): string {
  if (riskLevel === "low") {
    return "No configured high-risk phrase was detected by the rule-based safety pre-check.";
  }

  const categoryText = categories.length > 0 ? categories.join(", ") : "general concern";
  const analysisSource = geminiSafetyAnalysisUsed
    ? " Rule-based review was followed by optional Gemini safety analysis because uncertainty was high."
    : " Rule-based review was used before any LLM analysis.";
  return `This conversation contains concerning language that may require immediate adult or professional attention. Categories: ${categoryText}.${analysisSource}`;
}

function recommendedAction(riskLevel: RiskAssessment["riskLevel"]): string {
  if (riskLevel === "critical") {
    return "Show immediate safety guidance, involve a trusted adult or emergency/professional support, and block routine coaching as the primary result.";
  }
  if (riskLevel === "high") {
    return "Recommend prompt adult/professional support, route to therapist or psychologist review if consented, and do not gamify the event.";
  }
  if (riskLevel === "medium") {
    return "Suggest parent attention and optional professional review if the concern repeats or context is unclear.";
  }
  return "Continue normal coaching with routine safety reminders.";
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
