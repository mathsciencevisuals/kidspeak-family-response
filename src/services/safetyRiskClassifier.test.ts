import test from "node:test";
import assert from "node:assert/strict";
import { assessSafetyRisk, type RiskCategory } from "./safetyRiskClassifier";
import type { ConversationTurn } from "../types/sprint1";

const cases: Array<{ name: string; text: string; category: RiskCategory; minimumRisk: "high" | "critical" }> = [
  { name: "self harm", text: "I want to die", category: "self_harm", minimumRisk: "critical" },
  { name: "harm to others", text: "I will hurt him", category: "harm_to_others", minimumRisk: "critical" },
  { name: "abuse disclosure", text: "he hits me", category: "abuse_disclosure", minimumRisk: "high" },
  { name: "severe fear", text: "I am scared to go home", category: "severe_fear", minimumRisk: "high" },
  { name: "violence", text: "I will kill", category: "violence", minimumRisk: "critical" },
  { name: "severe hopelessness", text: "nobody loves me", category: "severe_hopelessness", minimumRisk: "high" },
  { name: "parent aggression", text: "I will hit you", category: "parent_aggression", minimumRisk: "high" },
  { name: "child extreme distress", text: "I hate myself", category: "child_extreme_distress", minimumRisk: "high" },
];

for (const item of cases) {
  test(`detects ${item.name}`, () => {
    const assessment = assessSafetyRisk("session_test", [turn(item.text)]);
    assert.equal(assessment.riskCategories.includes(item.category), true);
    assert.equal(assessment.detectedPhrases.length > 0, true);
    assert.equal(assessment.requireProfessionalReview, true);
    assert.equal(assessment.blockNormalCoaching, true);
    if (item.minimumRisk === "critical") {
      assert.equal(assessment.riskLevel, "critical");
    } else {
      assert.equal(["high", "critical"].includes(assessment.riskLevel), true);
    }
  });
}

test("allows normal coaching for low risk content", () => {
  const assessment = assessSafetyRisk("session_low", [turn("I feel frustrated because homework is hard.")]);
  assert.equal(assessment.riskLevel, "low");
  assert.deepEqual(assessment.riskCategories, []);
  assert.equal(assessment.blockNormalCoaching, false);
  assert.equal(assessment.requireProfessionalReview, false);
});

test("uses optional Gemini safety flag only for high uncertainty medium content", () => {
  const assessment = assessSafetyRisk("session_medium", [turn("Please stop, I cannot handle this.")], {
    geminiSafetyAnalysisEnabled: true,
  });
  assert.equal(assessment.riskLevel, "medium");
  assert.equal(assessment.geminiSafetyAnalysisUsed, true);
});

function turn(text: string): ConversationTurn {
  return {
    id: `turn_${text}`,
    sessionId: "session_test",
    speaker: "child",
    startTimeSec: 0,
    endTimeSec: 1,
    text,
    emotionLabel: "unknown",
    toneLabel: "unknown",
    intentLabel: "unknown",
    conversationAct: "unknown",
    escalationScore: 0,
    repairOpportunity: "",
    suggestedReframe: "",
  };
}
