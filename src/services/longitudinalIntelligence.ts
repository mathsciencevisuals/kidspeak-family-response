import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionMetric } from "../types/sprint1";

export const longitudinalInsightSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().min(1),
  childId: z.string().min(1),
  period: z.string().min(1),
  title: z.string().min(1),
  insightType: z.enum([
    "improvement",
    "concern",
    "repeated_trigger",
    "parent_growth",
    "child_growth",
    "therapist_review",
  ]),
  metricName: z.string().min(1),
  previousValue: z.number(),
  currentValue: z.number(),
  changePercent: z.number(),
  explanation: z.string().min(1),
  recommendedNextStep: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

export type LongitudinalInsight = z.infer<typeof longitudinalInsightSchema>;
export type TrendInsight = LongitudinalInsight;

type MetricName =
  | "escalation rate"
  | "repair score"
  | "parent validation score"
  | "parent criticism frequency"
  | "parent threat frequency"
  | "child shutdown frequency"
  | "child clarity score"
  | "child self-regulation score"
  | "listening balance"
  | "top triggers";

export function generateLongitudinalInsights(
  metrics: SessionMetric[],
  options: { period?: string; familyId?: string; childId?: string } = {},
): LongitudinalInsight[] {
  const sorted = [...metrics].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sorted.length === 0) {
    return [];
  }

  const familyId = options.familyId ?? sorted[0].familyId;
  const childId = options.childId ?? sorted[0].childId;
  const period = options.period ?? periodLabel(sorted);
  const midpoint = Math.max(1, Math.floor(sorted.length / 2));
  const previous = sorted.slice(0, midpoint);
  const current = sorted.slice(midpoint);
  const recent = current.length > 0 ? current : previous;
  const insights: LongitudinalInsight[] = [];

  const previousEscalation = average(previous.map((metric) => metric.parentEscalationScore));
  const currentEscalation = average(recent.map((metric) => metric.parentEscalationScore));
  if (previousEscalation - currentEscalation >= 8) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "improvement",
      metricName: "escalation rate",
      previousValue: previousEscalation,
      currentValue: currentEscalation,
      title: `Escalation risk dropped ${Math.abs(changePercent(previousEscalation, currentEscalation))}% across recent sessions.`,
      explanation: "Sessions show escalation risk reduced across the recent period, especially when repair attempts happened earlier.",
      recommendedNextStep: "Coaching focus could be to keep the pause-before-repeat routine during the first two minutes of conflict.",
      confidence: confidence(sorted.length),
    }));
  }

  const previousRepair = average(previous.map((metric) => metric.repairScore));
  const currentRepair = average(recent.map((metric) => metric.repairScore));
  if (currentRepair - previousRepair >= 6) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "improvement",
      metricName: "repair score",
      previousValue: previousRepair,
      currentValue: currentRepair,
      title: "Repair attempts increased in recent sessions.",
      explanation: "Patterns suggest repair is happening earlier and more consistently than in the first half of the period.",
      recommendedNextStep: "Coaching focus could be to name the repair phrase that worked and repeat it in the next session.",
      confidence: confidence(sorted.length),
    }));
  }

  const previousValidation = average(previous.map((metric) => metric.parentValidationScore));
  const currentValidation = average(recent.map((metric) => metric.parentValidationScore));
  if (currentValidation - previousValidation >= 5) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "parent_growth",
      metricName: "parent validation score",
      previousValue: previousValidation,
      currentValue: currentValidation,
      title: "Validation before correction increased in recent sessions.",
      explanation: "Sessions show more validation language before correction or boundaries.",
      recommendedNextStep: "Coaching focus could be one validation sentence before each instruction.",
      confidence: confidence(sorted.length),
    }));
  }

  const previousClarity = average(previous.map((metric) => metric.childClarityScore));
  const currentClarity = average(recent.map((metric) => metric.childClarityScore));
  if (currentClarity - previousClarity >= 5) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "child_growth",
      metricName: "child clarity score",
      previousValue: previousClarity,
      currentValue: currentClarity,
      title: "Child used clearer feeling words in recent sessions.",
      explanation: "Patterns suggest the child is naming needs and feelings more clearly across recent sessions.",
      recommendedNextStep: "Coaching focus could be the sentence: I feel ___ because ___. I need ___.",
      confidence: confidence(sorted.length),
    }));
  }

  const previousRegulation = average(previous.map((metric) => metric.childRegulationScore));
  const currentRegulation = average(recent.map((metric) => metric.childRegulationScore));
  if (currentRegulation - previousRegulation >= 5) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "child_growth",
      metricName: "child self-regulation score",
      previousValue: previousRegulation,
      currentValue: currentRegulation,
      title: "Child self-regulation improved across recent sessions.",
      explanation: "Sessions show more pauses, clearer requests, or quicker return to the conversation after a trigger.",
      recommendedNextStep: "Coaching focus could be practising one pause and one help request during the next trigger.",
      confidence: confidence(sorted.length),
    }));
  }

  const triggerCounts = topCounts(sorted.flatMap((metric) => metric.triggerTags));
  const [topTrigger, topTriggerCount] = triggerCounts[0] ?? ["No repeated trigger", 0];
  if (topTriggerCount >= Math.min(5, Math.ceil(sorted.length / 2))) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "repeated_trigger",
      metricName: "top triggers",
      previousValue: 0,
      currentValue: topTriggerCount,
      title: `${sentenceCase(topTrigger)} appears in ${topTriggerCount} of the last ${sorted.length} sessions.`,
      explanation: `Patterns suggest ${topTrigger} is still the most common trigger, even while communication skills may be improving.`,
      recommendedNextStep: `Coaching focus could be a short family plan before ${topTrigger} starts.`,
      confidence: confidence(sorted.length),
    }));
  }

  const parentCriticism = tagFrequency(recent, "global_criticism", "criticism", "label");
  const parentThreat = tagFrequency(recent, "threat", "threat_based_boundary");
  const childShutdown = tagFrequency(recent, "shutdown", "withdrawal");
  if (parentCriticism >= 2) {
    insights.push(frequencyInsight(familyId, childId, period, "parent criticism frequency", parentCriticism, "concern", "Patterns suggest criticism labels are repeating in recent sessions.", "Coaching focus could be replacing labels with observable facts."));
  }
  if (parentThreat >= 2) {
    insights.push(frequencyInsight(familyId, childId, period, "parent threat frequency", parentThreat, "concern", "Sessions show threat-based boundaries are still appearing.", "Coaching focus could be calm, predictable consequences without threat language."));
  }
  if (childShutdown >= 2) {
    insights.push(frequencyInsight(familyId, childId, period, "child shutdown frequency", childShutdown, "concern", "Patterns suggest shutdown signals are repeating after escalation.", "Coaching focus could be shorter turns and a low-pressure restart phrase."));
  }

  const highDistressCount = sorted.filter((metric) =>
    metric.overallEscalationRisk === "high" ||
    metric.overallEscalationRisk === "critical" ||
    metric.childPatternTags.some((tag) => tag.includes("distress")),
  ).length;
  if (highDistressCount >= 2) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "therapist_review",
      metricName: "child shutdown frequency",
      previousValue: 0,
      currentValue: highDistressCount,
      title: "High distress language appeared repeatedly.",
      explanation: "Sessions show repeated high distress signals. This may benefit from professional review.",
      recommendedNextStep: "Consider professional review if consent is granted, especially before routine coaching continues.",
      confidence: confidence(sorted.length),
    }));
  }

  if (insights.length === 0) {
    insights.push(insight({
      familyId,
      childId,
      period,
      insightType: "improvement",
      metricName: "listening balance",
      previousValue: average(previous.map((metric) => metric.listeningScore)),
      currentValue: average(recent.map((metric) => metric.listeningScore)),
      title: "Sessions show steady communication practice.",
      explanation: "Patterns suggest more sessions may be needed before a strong trend appears.",
      recommendedNextStep: "Coaching focus could be collecting two more consented sessions for a clearer trend.",
      confidence: "low",
    }));
  }

  return insights;
}

function insight(input: Omit<LongitudinalInsight, "id" | "changePercent">): LongitudinalInsight {
  return longitudinalInsightSchema.parse({
    ...input,
    id: `trend_insight_${randomUUID()}`,
    changePercent: changePercent(input.previousValue, input.currentValue),
  });
}

function frequencyInsight(
  familyId: string,
  childId: string,
  period: string,
  metricName: MetricName,
  count: number,
  insightType: "concern" | "therapist_review",
  explanation: string,
  recommendedNextStep: string,
): LongitudinalInsight {
  return insight({
    familyId,
    childId,
    period,
    insightType,
    metricName,
    previousValue: 0,
    currentValue: count,
    title: `${sentenceCase(metricName)} appeared ${count} times in recent sessions.`,
    explanation,
    recommendedNextStep,
    confidence: "medium",
  });
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function changePercent(previousValue: number, currentValue: number): number {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : 100;
  }
  return Math.round(((currentValue - previousValue) / previousValue) * 100);
}

function confidence(metricsCount: number): LongitudinalInsight["confidence"] {
  if (metricsCount >= 8) {
    return "high";
  }
  if (metricsCount >= 4) {
    return "medium";
  }
  return "low";
}

function periodLabel(metrics: SessionMetric[]): string {
  return `${metrics[0].createdAt.slice(0, 10)} to ${metrics[metrics.length - 1].createdAt.slice(0, 10)}`;
}

function topCounts(tags: string[]): Array<[string, number]> {
  const counts = tags.reduce<Record<string, number>>((result, tag) => {
    result[tag] = (result[tag] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function tagFrequency(metrics: SessionMetric[], ...needles: string[]): number {
  return metrics.reduce((sum, metric) => {
    const tags = [...metric.parentPatternTags, ...metric.childPatternTags];
    return sum + tags.filter((tag) => needles.some((needle) => tag.includes(needle))).length;
  }, 0);
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
