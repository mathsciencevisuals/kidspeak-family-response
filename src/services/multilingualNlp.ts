import { bilingualRecommendation, type SupportedLanguage } from "../localisation/languages";
import type { ConversationNode, ConversationTurn } from "../types/sprint1";

export type AnalysisConfidence = "high" | "medium" | "low";
export type DetectedPattern = "parent_escalation" | "child_reaction" | "needs_human_review";

export type MultilingualAnalysisResult = {
  nodes: ConversationNode[];
  confidence: AnalysisConfidence;
  originalLanguage: SupportedLanguage;
};

type PhraseEntry = {
  phrase: string;
  meaning: string;
};

const parentEscalationPhrases: Record<SupportedLanguage, PhraseEntry[]> = {
  "en-IN": [
    { phrase: "always lazy", meaning: "uses a fixed negative label" },
    { phrase: "never listen", meaning: "uses an absolute statement about listening" },
    { phrase: "useless", meaning: "uses a harsh personal label" },
    { phrase: "because I said so", meaning: "uses authority without explanation" },
    { phrase: "no phone", meaning: "sets a phone boundary" },
  ],
  "hi-IN": [
    { phrase: "tum kabhi nahi sunte", meaning: "you never listen" },
    { phrase: "hamesha bahane", meaning: "always making excuses" },
    { phrase: "nikamme", meaning: "harsh personal label" },
    { phrase: "phone nahi milega", meaning: "phone will not be available" },
  ],
  "te-IN": [
    { phrase: "eppudu vinavu", meaning: "you never listen" },
    { phrase: "eppudu excuses", meaning: "always making excuses" },
    { phrase: "phone ivvanu", meaning: "phone will not be given" },
  ],
  "ta-IN": [
    { phrase: "nee eppovume kekka maata", meaning: "you never listen" },
    { phrase: "eppovume excuse", meaning: "always making excuses" },
    { phrase: "phone kidaikkathu", meaning: "phone will not be available" },
  ],
};

const childReactionPhrases: Record<SupportedLanguage, PhraseEntry[]> = {
  "en-IN": [
    { phrase: "i don't care", meaning: "expresses disengagement" },
    { phrase: "i don’t care", meaning: "expresses disengagement" },
    { phrase: "leave me", meaning: "asks for space" },
    { phrase: "i hate school", meaning: "negative school-related emotion" },
    { phrase: "i can't", meaning: "expresses low confidence" },
    { phrase: "i can’t", meaning: "expresses low confidence" },
  ],
  "hi-IN": [
    { phrase: "mujhe farak nahi padta", meaning: "I do not care" },
    { phrase: "mujhe akela chhod do", meaning: "leave me alone" },
    { phrase: "mujhe school pasand nahi", meaning: "I do not like school" },
  ],
  "te-IN": [
    { phrase: "naaku parvaledu", meaning: "I do not care" },
    { phrase: "nannu vadileyandi", meaning: "leave me alone" },
    { phrase: "school nachadu", meaning: "I do not like school" },
  ],
  "ta-IN": [
    { phrase: "enakku parava illai", meaning: "I do not care" },
    { phrase: "ennai vidunga", meaning: "leave me alone" },
    { phrase: "school pidikkala", meaning: "I do not like school" },
  ],
};

export function analyzeMultilingualTranscript(
  turns: ConversationTurn[],
  languageCode: SupportedLanguage,
  coachingLanguage: SupportedLanguage,
): MultilingualAnalysisResult {
  const nodes = turns.map((turn, index) => analyzeTurn(turn, index, languageCode, coachingLanguage));
  const highCount = nodes.filter((node) => node.analysisConfidence === "high").length;
  const mediumCount = nodes.filter((node) => node.analysisConfidence === "medium").length;

  return {
    nodes,
    confidence: highCount > 0 ? "high" : mediumCount > 0 ? "medium" : "low",
    originalLanguage: languageCode,
  };
}

function analyzeTurn(
  turn: ConversationTurn,
  index: number,
  languageCode: SupportedLanguage,
  coachingLanguage: SupportedLanguage,
): ConversationNode {
  const text = normalize(turn.text);
  const parentMatch = findPhrase(text, parentEscalationPhrases[languageCode]);
  const childMatch = findPhrase(text, childReactionPhrases[languageCode]);
  const englishMatch = languageCode === "en-IN" ? null : findPhrase(text, [
    ...parentEscalationPhrases["en-IN"],
    ...childReactionPhrases["en-IN"],
  ]);

  if (parentMatch) {
    return nodeForMatch(turn, index, languageCode, coachingLanguage, "parent_escalation", parentMatch, "high");
  }

  if (childMatch) {
    return nodeForMatch(turn, index, languageCode, coachingLanguage, "child_reaction", childMatch, "high");
  }

  if (englishMatch) {
    return nodeForMatch(turn, index, languageCode, coachingLanguage, "child_reaction", englishMatch, "medium");
  }

  return {
    id: `node_rule_${index + 1}`,
    sessionId: turn.sessionId,
    nodeType: "coaching",
    title: "Needs human review",
    description: "Rule-based multilingual analysis did not find a strong phrase match.",
    speaker: turn.speaker,
    severity: "low",
    connectedToNodeIds: [],
    detectedAtSec: turn.startTimeSec,
    recommendation: bilingualRecommendation(
      "Review this turn with context before making a coaching conclusion.",
      coachingLanguage,
    ),
    originalUtterance: turn.text,
    translatedMeaning: turn.translatedText,
    detectedPattern: "needs_human_review",
    analysisConfidence: "low",
    originalLanguage: languageCode,
    recommendationLanguage: coachingLanguage,
  };
}

function nodeForMatch(
  turn: ConversationTurn,
  index: number,
  languageCode: SupportedLanguage,
  coachingLanguage: SupportedLanguage,
  pattern: DetectedPattern,
  match: PhraseEntry,
  confidence: AnalysisConfidence,
): ConversationNode {
  const isParentPattern = pattern === "parent_escalation";
  const englishRecommendation = isParentPattern
    ? "Try a respectful boundary with a short reason and one validation phrase."
    : "Reflect the feeling first, then invite one small next step.";

  return {
    id: `node_rule_${index + 1}`,
    sessionId: turn.sessionId,
    nodeType: isParentPattern ? "escalation" : "child_response",
    title: isParentPattern ? "Escalation phrase detected" : "Child reaction phrase detected",
    description: `Matched phrase: ${match.phrase}`,
    speaker: turn.speaker,
    severity: isParentPattern ? "medium" : "low",
    connectedToNodeIds: [],
    detectedAtSec: turn.startTimeSec,
    recommendation: bilingualRecommendation(englishRecommendation, coachingLanguage),
    originalUtterance: turn.text,
    translatedMeaning: turn.translatedText ?? match.meaning,
    detectedPattern: pattern,
    analysisConfidence: confidence,
    originalLanguage: languageCode,
    recommendationLanguage: coachingLanguage,
  };
}

function findPhrase(text: string, phrases: PhraseEntry[]): PhraseEntry | null {
  return phrases.find((entry) => text.includes(normalize(entry.phrase))) ?? null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
