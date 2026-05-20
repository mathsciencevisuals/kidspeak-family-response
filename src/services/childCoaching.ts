import type { ConversationTurn } from "../types/sprint1";

export type Feeling =
  | "angry"
  | "frustrated"
  | "sad"
  | "scared"
  | "confused"
  | "embarrassed"
  | "jealous"
  | "tired";

export type PracticeScenario = {
  situation: string;
  badReactionOption: string;
  betterResponseOption: string;
  whyBetterResponseHelps: string;
};

export type ChildReflection = {
  whatHappened: string;
  whatIFelt: string;
  whatISaid: string;
  biggerOrSmaller: "bigger" | "smaller" | "not_sure";
  nextTime: string;
};

export type ChildAnalysis = {
  sessionId: string;
  feelings: Feeling[];
  sentenceBuilderExample: string;
  reflectionCards: Array<{ prompt: string; helperText: string }>;
  practiceScenarios: PracticeScenario[];
  badges: string[];
  generatedBy: "rule_based";
  aiUsed: false;
  cacheable: true;
};

const feelingRules: Array<{ feeling: Feeling; phrases: string[] }> = [
  { feeling: "angry", phrases: ["angry", "mad", "hate", "gussa"] },
  { feeling: "frustrated", phrases: ["can't", "can’t", "hard", "frustrated", "difficult"] },
  { feeling: "sad", phrases: ["sad", "cry", "upset"] },
  { feeling: "scared", phrases: ["scared", "afraid", "worried"] },
  { feeling: "confused", phrases: ["confused", "don't know", "do not know"] },
  { feeling: "embarrassed", phrases: ["embarrassed", "shame", "everyone saw"] },
  { feeling: "jealous", phrases: ["jealous", "not fair", "they got"] },
  { feeling: "tired", phrases: ["tired", "sleepy", "exhausted"] },
];

export const childPracticeScenarios: PracticeScenario[] = [
  {
    situation: "Homework is hard",
    badReactionOption: "I quit. I cannot do this.",
    betterResponseOption: "I feel frustrated because the question is hard. I need help starting. Can we do one together?",
    whyBetterResponseHelps: "It names the feeling and asks for a small kind of help.",
  },
  {
    situation: "Parent says no phone",
    badReactionOption: "I do not care. Leave me alone.",
    betterResponseOption: "I feel upset because I wanted phone time. I need to know when I can try again.",
    whyBetterResponseHelps: "It keeps the conversation open and asks for a clear next step.",
  },
  {
    situation: "Sibling takes toy",
    badReactionOption: "Give it back or I will grab it.",
    betterResponseOption: "I feel angry because I was using it. I need a turn back. Can we set a timer?",
    whyBetterResponseHelps: "It asks for fairness without making the problem bigger.",
  },
  {
    situation: "Teacher corrects mistake",
    badReactionOption: "This is stupid.",
    betterResponseOption: "I feel embarrassed because I made a mistake. I need one example. Can you show me?",
    whyBetterResponseHelps: "It turns correction into help.",
  },
  {
    situation: "Friend does not include me",
    badReactionOption: "Fine, I hate you.",
    betterResponseOption: "I feel sad because I wanted to join. I need to know if I can play next round.",
    whyBetterResponseHelps: "It says the feeling and asks a clear question.",
  },
];

export const kidBadges = [
  "I paused",
  "I named my feeling",
  "I asked for help",
  "I listened",
  "I repaired",
];

export function analyzeChildSelfCoaching(sessionId: string, turns: ConversationTurn[]): ChildAnalysis {
  const childTurns = turns.filter((turn) => turn.speaker === "child");
  const childText = childTurns.map((turn) => turn.text).join(" ").toLowerCase();
  const feelings = feelingRules
    .filter((rule) => rule.phrases.some((phrase) => childText.includes(phrase)))
    .map((rule) => rule.feeling);

  return {
    sessionId,
    feelings: feelings.length > 0 ? Array.from(new Set(feelings)) : ["confused"],
    sentenceBuilderExample:
      "I feel frustrated because the question is hard. I need help starting. Can we do one together?",
    reflectionCards: [
      { prompt: "What happened?", helperText: "Say the event in simple words." },
      { prompt: "What did I feel?", helperText: "Pick one feeling or write your own." },
      { prompt: "What did I say?", helperText: "Remember the words without blaming yourself." },
      { prompt: "Did it make the problem bigger or smaller?", helperText: "Notice what happened next." },
      { prompt: "What will I try next time?", helperText: "Choose one better sentence or pause." },
    ],
    practiceScenarios: childPracticeScenarios,
    badges: kidBadges,
    generatedBy: "rule_based",
    aiUsed: false,
    cacheable: true,
  };
}
