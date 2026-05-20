import test from "node:test";
import assert from "node:assert/strict";
import { generateLongitudinalInsights } from "./longitudinalIntelligence";
import type { SessionMetric } from "../types/sprint1";

test("generates improvement, repeated trigger, parent growth, and child growth insights", () => {
  const insights = generateLongitudinalInsights(metrics());
  const types = insights.map((insight) => insight.insightType);

  assert.equal(types.includes("improvement"), true);
  assert.equal(types.includes("repeated_trigger"), true);
  assert.equal(types.includes("parent_growth"), true);
  assert.equal(types.includes("child_growth"), true);
  assert.equal(insights.some((insight) => insight.explanation.includes("Patterns suggest") || insight.explanation.includes("Sessions show")), true);
  assert.equal(insights.some((insight) => insight.explanation.includes("disorder")), false);
});

test("generates professional review insight for repeated high distress", () => {
  const highDistress = metrics().map((metric, index) => ({
    ...metric,
    overallEscalationRisk: index > 4 ? "high" as const : metric.overallEscalationRisk,
    childPatternTags: index > 4 ? ["high_distress"] : metric.childPatternTags,
  }));

  const insights = generateLongitudinalInsights(highDistress);
  assert.equal(insights.some((insight) => insight.insightType === "therapist_review"), true);
});

function metrics(): SessionMetric[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `metric-${index}`,
    sessionId: `session-${index}`,
    familyId: "family-1",
    childId: "child-1",
    createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    situationType: index % 2 === 0 ? "homework_conflict" : "screen_time",
    language: "en-IN",
    parentValidationScore: [45, 48, 52, 56, 64, 70, 76, 82][index],
    parentEscalationScore: [72, 68, 64, 60, 52, 46, 39, 34][index],
    childRegulationScore: [42, 45, 48, 52, 60, 66, 72, 78][index],
    childClarityScore: [40, 44, 48, 52, 61, 68, 74, 80][index],
    listeningScore: [48, 50, 55, 57, 62, 66, 70, 75][index],
    repairScore: [44, 48, 52, 58, 65, 72, 78, 84][index],
    overallEscalationRisk: "low",
    triggerTags: index < 5 ? ["homework"] : ["screen time"],
    parentPatternTags: index > 4 ? ["validation"] : ["global_criticism"],
    childPatternTags: index > 4 ? ["clarity"] : ["shutdown"],
  }));
}
