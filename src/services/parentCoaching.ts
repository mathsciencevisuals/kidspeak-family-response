import { bilingualRecommendation, type SupportedLanguage } from "../localisation/languages";
import type { ConversationTurn } from "../types/sprint1";

export type ParentPattern =
  | "Correction before connection"
  | "Global criticism"
  | "Threat-based boundary"
  | "Over-talking"
  | "Dismissed emotion"
  | "Inconsistent boundary"
  | "Calm validation"
  | "Successful repair attempt";

export type ParentCoachingScore = {
  validationSkill: number;
  boundaryClarity: number;
  listeningQuality: number;
  escalationControl: number;
  repairAttempt: number;
  emotionalRegulation: number;
};

export type PhraseComparison = {
  originalPhrase: string;
  detectedPattern: ParentPattern;
  impactOnChildResponse: string;
  betterAlternative: string;
};

export type ParentAnalysis = {
  sessionId: string;
  patterns: ParentPattern[];
  score: ParentCoachingScore;
  phraseComparisons: PhraseComparison[];
  script: string;
  practicePlan: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  professionalReviewRecommended: boolean;
  safetyReason?: string;
  generatedBy: "rule_based";
  cacheable: true;
};

const severeRiskPhrases = [
  "hit you",
  "beat you",
  "kill",
  "hurt yourself",
  "i will hurt",
  "get out of the house",
  "you should die",
  "violence",
  "abuse",
];

const patternRules: Array<{
  pattern: ParentPattern;
  phrases: string[];
  impact: string;
  alternative: string;
}> = [
  {
    pattern: "Global criticism",
    phrases: ["always lazy", "useless", "never listen", "nikamme"],
    impact: "Child may become defensive and stop explaining what felt difficult.",
    alternative: "I see the homework is incomplete. What part felt hard?",
  },
  {
    pattern: "Threat-based boundary",
    phrases: ["no phone", "phone nahi milega", "phone ivvanu", "phone kidaikkathu"],
    impact: "Child may focus on the threat instead of the next repair step.",
    alternative: "Phone time starts after ten focused minutes. I can sit nearby while you begin.",
  },
  {
    pattern: "Correction before connection",
    phrases: ["why did you not", "because i said so", "hamesha bahane", "eppudu excuses", "eppovume excuse"],
    impact: "Child may hear correction before they feel understood.",
    alternative: "I can see this is hard to start. We still need to begin with one small step.",
  },
  {
    pattern: "Calm validation",
    phrases: ["i hear", "i understand", "i can see", "switching is hard"],
    impact: "Child is more likely to stay engaged because emotion is acknowledged.",
    alternative: "Keep the validation and add one clear boundary.",
  },
  {
    pattern: "Successful repair attempt",
    phrases: ["let us restart", "sorry", "i spoke sharply", "try again"],
    impact: "Repair can reduce escalation and model respectful communication.",
    alternative: "Name the repair and return to the next small step.",
  },
];

const practicePlan = [
  "Day 1: One validation sentence before correction",
  "Day 2: Replace labels with observations",
  "Day 3: Ask one curious question",
  "Day 4: Use calm boundary",
  "Day 5: Avoid threats; use predictable consequence",
  "Day 6: Listen for 30 seconds without interrupting",
  "Day 7: Review improvement",
];

export function analyzeParentCoaching(
  sessionId: string,
  turns: ConversationTurn[],
  coachingLanguage: SupportedLanguage = "en-IN",
): ParentAnalysis {
  const parentTurns = turns.filter((turn) => turn.speaker === "parent");
  const parentText = parentTurns.map((turn) => turn.text).join(" ").toLowerCase();
  const severePhrase = severeRiskPhrases.find((phrase) => parentText.includes(phrase));
  const phraseComparisons = parentTurns.flatMap((turn) => compareParentPhrase(turn.text));
  const patterns = unique(phraseComparisons.map((comparison) => comparison.detectedPattern));
  const riskLevel: ParentAnalysis["riskLevel"] = severePhrase
    ? "critical"
    : patterns.includes("Threat-based boundary")
      ? "medium"
      : "low";

  return {
    sessionId,
    patterns: patterns.length > 0 ? patterns : ["Inconsistent boundary"],
    score: scorePatterns(patterns, severePhrase),
    phraseComparisons,
    script: buildParentScript(
      "The homework is incomplete.",
      "It looks hard to get started.",
      "We still need ten focused minutes.",
      "Choose the first question or read the instructions aloud.",
      coachingLanguage,
    ),
    practicePlan,
    riskLevel,
    professionalReviewRecommended: riskLevel === "critical",
    safetyReason: severePhrase
      ? "Language suggests severe aggression, intimidation, abuse, self-harm threats, or violence."
      : undefined,
    generatedBy: "rule_based",
    cacheable: true,
  };
}

export function buildParentScript(
  observe: string,
  validate: string,
  boundary: string,
  smallNextStep: string,
  coachingLanguage: SupportedLanguage,
): string {
  const english = `Observe: ${observe}\nValidate: ${validate}\nBoundary: ${boundary}\nSmall next step: ${smallNextStep}`;
  return bilingualRecommendation(english, coachingLanguage);
}

export function createParentPracticePlan(): string[] {
  return practicePlan;
}

function compareParentPhrase(text: string): PhraseComparison[] {
  const normalized = text.toLowerCase();
  return patternRules
    .filter((rule) => rule.phrases.some((phrase) => normalized.includes(phrase)))
    .map((rule) => ({
      originalPhrase: text,
      detectedPattern: rule.pattern,
      impactOnChildResponse: rule.impact,
      betterAlternative: rule.alternative,
    }));
}

function scorePatterns(patterns: ParentPattern[], severePhrase?: string): ParentCoachingScore {
  const has = (pattern: ParentPattern) => patterns.includes(pattern);
  const penalty = severePhrase ? 35 : 0;

  return {
    validationSkill: clamp(has("Calm validation") ? 78 : 52),
    boundaryClarity: clamp(has("Threat-based boundary") ? 48 : 68),
    listeningQuality: clamp(has("Over-talking") || has("Dismissed emotion") ? 45 : 64),
    escalationControl: clamp(has("Global criticism") || severePhrase ? 38 - penalty : 66),
    repairAttempt: clamp(has("Successful repair attempt") ? 76 : 50),
    emotionalRegulation: clamp(has("Global criticism") || has("Threat-based boundary") ? 46 : 68),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
