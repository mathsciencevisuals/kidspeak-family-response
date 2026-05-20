import { z } from "zod";

export const professionalNoteVisibilitySchema = z.enum(["private_to_therapist", "shared_with_parent"]);
export const assignedPracticeTypeSchema = z.enum([
  "parent_validation_practice",
  "child_feeling_sentence_practice",
  "calm_boundary_practice",
  "repair_conversation_practice",
  "screen_time_agreement",
  "homework_start_routine",
]);
export const therapistAuditEventTypeSchema = z.enum([
  "therapist_opened_session",
  "therapist_added_note",
  "therapist_exported_summary",
]);

export const professionalNoteInputSchema = z.object({
  therapistUserId: z.string().min(1).default("user_therapist_1"),
  note: z.string().min(1),
  formulationObservation: z.string().min(1),
  recommendedHomePractice: z.string().min(1),
  followUpDate: z.string().optional(),
  visibility: professionalNoteVisibilitySchema,
});

export const assignedPracticeInputSchema = z.object({
  therapistUserId: z.string().min(1).default("user_therapist_1"),
  practiceType: assignedPracticeTypeSchema,
  instructions: z.string().min(1),
  dueDate: z.string().optional(),
  visibility: professionalNoteVisibilitySchema.default("shared_with_parent"),
});

export type ProfessionalNoteInput = z.infer<typeof professionalNoteInputSchema>;
export type AssignedPracticeInput = z.infer<typeof assignedPracticeInputSchema>;
export type ProfessionalNoteVisibility = z.infer<typeof professionalNoteVisibilitySchema>;
export type AssignedPracticeType = z.infer<typeof assignedPracticeTypeSchema>;
export type TherapistAuditEventType = z.infer<typeof therapistAuditEventTypeSchema>;

export interface TherapistFamily {
  id: string;
  name: string;
  childName: string;
  assignedTherapistUserId: string;
  therapistShareConsentGranted: boolean;
  recentSessionCount: number;
  pendingReviewCount: number;
  highRiskCount: number;
  lastSessionAt: string;
}

export interface TherapistSessionCard {
  id: string;
  familyId: string;
  familyName: string;
  childName: string;
  date: string;
  situation: string;
  language: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "reviewed" | "pending_review";
  summary: string;
}

export interface TherapistFamilySummary {
  familyId: string;
  familyName: string;
  childName: string;
  therapistShareConsentGranted: boolean;
  assignedTherapistUserId: string;
  topTriggers: string[];
  parentResponseTrends: string[];
  childResponseTrends: string[];
  repairScoreTrend: number[];
  escalationTrend: number[];
  safetyRiskEvents: string[];
  homePracticeCompletion: number;
  cachedSummary: string;
}

export interface TherapistSessionReview {
  session: TherapistSessionCard;
  consentRequired: "therapist_share";
  accessGranted: boolean;
  transcriptTimeline: Array<{
    speaker: "parent" | "child" | "unknown";
    time: string;
    text: string;
    emotionalSignal: string;
  }>;
  conversationGraph: Array<{
    nodeType: string;
    label: string;
    detectedPattern: string;
    confidence: "high" | "medium" | "low";
  }>;
  parentCoachingObservations: string[];
  childCopingSignals: string[];
  riskFlags: string[];
  cachedProfessionalSummary: string;
  professionalNotes: ProfessionalNoteRecord[];
  assignedPractice: AssignedPracticeRecord[];
}

export interface ProfessionalNoteRecord extends ProfessionalNoteInput {
  id: string;
  sessionId: string;
  createdAt: string;
}

export interface AssignedPracticeRecord extends AssignedPracticeInput {
  id: string;
  sessionId: string;
  assignedAt: string;
}

export interface TherapistAuditEvent {
  id: string;
  therapistUserId: string;
  eventType: TherapistAuditEventType;
  familyId?: string;
  sessionId?: string;
  createdAt: string;
  details: string;
}

export interface TherapistExportSummary {
  id: string;
  sessionId: string;
  generatedAt: string;
  sessionDate: string;
  situation: string;
  observedPatterns: string[];
  coachingSuggestions: string[];
  practicePlan: string[];
  disclaimer: string;
}

export const therapistFamilies: TherapistFamily[] = [
  {
    id: "family-demo-1",
    name: "Rao Family",
    childName: "Aarav",
    assignedTherapistUserId: "user_therapist_1",
    therapistShareConsentGranted: true,
    recentSessionCount: 4,
    pendingReviewCount: 1,
    highRiskCount: 0,
    lastSessionAt: "2026-05-16T18:30:00.000Z",
  },
  {
    id: "family-demo-2",
    name: "Iyer Family",
    childName: "Mira",
    assignedTherapistUserId: "user_therapist_1",
    therapistShareConsentGranted: true,
    recentSessionCount: 2,
    pendingReviewCount: 1,
    highRiskCount: 1,
    lastSessionAt: "2026-05-17T19:15:00.000Z",
  },
];

export const therapistSessions: TherapistSessionCard[] = [
  {
    id: "session-001",
    familyId: "family-demo-1",
    familyName: "Rao Family",
    childName: "Aarav",
    date: "2026-05-10",
    situation: "After-school transition",
    language: "en-IN",
    riskLevel: "low",
    status: "reviewed",
    summary: "Cached analysis shows repeated correction before connection, followed by a repair attempt.",
  },
  {
    id: "session-002",
    familyId: "family-demo-1",
    familyName: "Rao Family",
    childName: "Aarav",
    date: "2026-05-16",
    situation: "Homework boundary",
    language: "hi-IN",
    riskLevel: "medium",
    status: "pending_review",
    summary: "Cached analysis shows homework trigger frequency and improved pause-before-repeat pattern.",
  },
  {
    id: "session-003",
    familyId: "family-demo-2",
    familyName: "Iyer Family",
    childName: "Mira",
    date: "2026-05-17",
    situation: "Screen-time agreement",
    language: "ta-IN",
    riskLevel: "high",
    status: "pending_review",
    summary: "Cached analysis includes a risk flag and recommends professional review before routine coaching.",
  },
];

export function getAssignedTherapistFamilies(therapistUserId = "user_therapist_1"): TherapistFamily[] {
  return therapistFamilies.filter((family) => family.assignedTherapistUserId === therapistUserId);
}

export function getTherapistHome(therapistUserId = "user_therapist_1") {
  const assignedFamilies = getAssignedTherapistFamilies(therapistUserId);
  const familyIds = new Set(assignedFamilies.map((family) => family.id));
  const visibleSessions = therapistSessions.filter((session) => familyIds.has(session.familyId));

  return {
    assignedFamilies,
    recentSessions: visibleSessions.slice(0, 5),
    highRiskSessions: visibleSessions.filter((session) => session.riskLevel === "high" || session.riskLevel === "critical"),
    pendingReviewSessions: visibleSessions.filter((session) => session.status === "pending_review"),
  };
}

export function getTherapistFamilySummary(familyId: string, therapistUserId = "user_therapist_1"): TherapistFamilySummary {
  const family = requireAssignedFamily(familyId, therapistUserId);

  return {
    familyId: family.id,
    familyName: family.name,
    childName: family.childName,
    therapistShareConsentGranted: family.therapistShareConsentGranted,
    assignedTherapistUserId: family.assignedTherapistUserId,
    topTriggers: ["homework start", "screen-time ending", "after-school transition"],
    parentResponseTrends: [
      "Validation improved across recent sessions.",
      "Threat-based boundary language decreased.",
      "Repair attempts increased after escalation moments.",
    ],
    childResponseTrends: [
      "Child clarity improved when the parent asked one curious question.",
      "Shutdown signals reduced after shorter instructions.",
      "Feeling naming appears more often in later sessions.",
    ],
    repairScoreTrend: [55, 61, 68, 74],
    escalationTrend: [42, 38, 34, 31],
    safetyRiskEvents: family.highRiskCount > 0 ? ["High-risk language needs professional review."] : ["No high-risk event in assigned sessions."],
    homePracticeCompletion: family.id === "family-demo-1" ? 72 : 48,
    cachedSummary:
      "Observed communication patterns show fewer escalation loops and more repair attempts. This is a coaching summary, not a diagnosis.",
  };
}

export function getTherapistSessionReview(sessionId: string, therapistUserId = "user_therapist_1"): TherapistSessionReview {
  const session = therapistSessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("Therapist session not found");
  }
  const family = requireAssignedFamily(session.familyId, therapistUserId);

  return {
    session,
    consentRequired: "therapist_share",
    accessGranted: family.therapistShareConsentGranted,
    transcriptTimeline: [
      {
        speaker: "parent",
        time: "00:12",
        text: "Why did you not finish homework?",
        emotionalSignal: "correction before connection",
      },
      {
        speaker: "child",
        time: "00:20",
        text: "I do not want to do it.",
        emotionalSignal: "frustration and avoidance",
      },
      {
        speaker: "parent",
        time: "01:10",
        text: "I see it feels hard to start. Let us do one question together.",
        emotionalSignal: "validation and small next step",
      },
    ],
    conversationGraph: [
      { nodeType: "trigger", label: "Homework start", detectedPattern: "task demand trigger", confidence: "high" },
      { nodeType: "parent_response", label: "Rapid correction", detectedPattern: "correction before connection", confidence: "medium" },
      { nodeType: "child_response", label: "Avoidance", detectedPattern: "frustration signal", confidence: "medium" },
      { nodeType: "repair", label: "Small next step", detectedPattern: "successful repair attempt", confidence: "high" },
    ],
    parentCoachingObservations: [
      "Validation skill improved after the first escalation moment.",
      "Boundary clarity was stronger when the request became smaller.",
      "Listening quality improved when the parent paused before repeating.",
    ],
    childCopingSignals: [
      "Child named difficulty indirectly through refusal.",
      "Child re-engaged after the task was reduced to one question.",
      "Child regulation improved when the next step was concrete.",
    ],
    riskFlags: session.riskLevel === "high" ? ["Professional review recommended before routine coaching."] : ["No critical risk flag in cached analysis."],
    cachedProfessionalSummary:
      "The cached analysis highlights communication patterns, emotional signals, parent coaching needs, child coping signals, and repair opportunities. It does not present a medical diagnosis.",
    professionalNotes: [],
    assignedPractice: [],
  };
}

export function createProfessionalNoteRecord(sessionId: string, input: ProfessionalNoteInput): ProfessionalNoteRecord {
  return {
    ...input,
    id: `professional_note_${crypto.randomUUID()}`,
    sessionId,
    createdAt: new Date().toISOString(),
  };
}

export function createAssignedPracticeRecord(sessionId: string, input: AssignedPracticeInput): AssignedPracticeRecord {
  return {
    ...input,
    id: `assigned_practice_${crypto.randomUUID()}`,
    sessionId,
    assignedAt: new Date().toISOString(),
  };
}

export function createTherapistAuditEvent(
  eventType: TherapistAuditEventType,
  therapistUserId: string,
  details: string,
  ids: { familyId?: string; sessionId?: string },
): TherapistAuditEvent {
  return {
    id: `therapist_audit_${crypto.randomUUID()}`,
    therapistUserId,
    eventType,
    familyId: ids.familyId,
    sessionId: ids.sessionId,
    createdAt: new Date().toISOString(),
    details,
  };
}

export function createExportSummary(sessionId: string): TherapistExportSummary {
  const review = getTherapistSessionReview(sessionId);
  return {
    id: `export_summary_${crypto.randomUUID()}`,
    sessionId,
    generatedAt: new Date().toISOString(),
    sessionDate: review.session.date,
    situation: review.session.situation,
    observedPatterns: review.conversationGraph.map((node) => `${node.label}: ${node.detectedPattern}`),
    coachingSuggestions: [
      ...review.parentCoachingObservations.slice(0, 2),
      ...review.childCopingSignals.slice(0, 1),
    ],
    practicePlan: [
      "Parent validation practice before correction.",
      "Child feeling sentence practice after a trigger.",
      "Repair conversation practice within the same day.",
    ],
    disclaimer:
      "This printable summary supports coaching and professional review. It is not a medical diagnosis and should be interpreted by a qualified professional when risk is present.",
  };
}

function requireAssignedFamily(familyId: string, therapistUserId: string): TherapistFamily {
  const family = therapistFamilies.find((candidate) => candidate.id === familyId);
  if (!family) {
    throw new Error("Therapist family not found");
  }
  if (family.assignedTherapistUserId !== therapistUserId) {
    throw new Error("Therapist is not assigned to this family");
  }
  if (!family.therapistShareConsentGranted) {
    throw new Error("Parent therapist_share consent is required");
  }
  return family;
}
