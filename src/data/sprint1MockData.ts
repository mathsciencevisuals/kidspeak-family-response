import type {
  ChildProfile,
  ConsentRecord,
  ConversationNode,
  ConversationSession,
  ConversationTurn,
  Family,
  Recommendation,
  SessionMetric,
  TherapistNote,
  FamilyTrendSnapshot,
  LanguagePreference,
  TranscriptUpload,
  User,
} from "../types/sprint1";

export const sprint1Users: User[] = [
  {
    id: "user_parent_1",
    role: "parent",
    displayName: "Ananya Rao",
    email: "ananya@example.com",
    createdAt: "2026-05-18T03:00:00.000Z",
  },
  {
    id: "user_therapist_1",
    role: "therapist",
    displayName: "Dr. Meera Sen",
    email: "meera@example.com",
    createdAt: "2026-05-18T03:00:00.000Z",
  },
];

export const sprint1Families: Family[] = [
  {
    id: "family_demo_1",
    name: "Rao Family",
    ownerUserId: "user_parent_1",
    memberUserIds: ["user_parent_1"],
    createdAt: "2026-05-18T03:00:00.000Z",
  },
];

export const sprint1ChildProfiles: ChildProfile[] = [
  {
    id: "child_demo_1",
    familyId: "family_demo_1",
    displayName: "Aarav",
    ageRange: "9-12",
    preferredLanguage: "en-IN",
    notes: "Prefers short, concrete coaching prompts.",
    createdAt: "2026-05-18T03:00:00.000Z",
  },
];

export const sprint1ConsentRecords: ConsentRecord[] = [
  {
    id: "consent_demo_1",
    familyId: "family_demo_1",
    childId: "child_demo_1",
    parentUserId: "user_parent_1",
    consentType: "recording",
    status: "granted",
    grantedAt: "2026-05-18T03:05:00.000Z",
  },
];

export const sprint1ConversationSession: ConversationSession = {
  id: "session_demo_1",
  familyId: "family_demo_1",
  childId: "child_demo_1",
  createdByUserId: "user_parent_1",
  situationType: "homework_conflict",
  language: "en-IN",
  durationSeconds: 420,
  inputMode: "transcript_upload",
  audioStoragePath: null,
  transcriptStatus: "analyzed",
  riskLevel: "low",
  overallPattern: "Correction loop softened after validation and repair.",
  createdAt: "2026-05-18T03:10:00.000Z",
  updatedAt: "2026-05-18T03:20:00.000Z",
};

export const sprint1ConversationTurns: ConversationTurn[] = [
  {
    id: "turn_demo_1",
    sessionId: "session_demo_1",
    speaker: "parent",
    startTimeSec: 10,
    endTimeSec: 18,
    text: "Please start your homework now.",
    emotionLabel: "frustrated",
    toneLabel: "firm",
    intentLabel: "set_boundary",
    conversationAct: "instruction",
    escalationScore: 0.35,
    repairOpportunity: "Validate transition difficulty before repeating instruction.",
    suggestedReframe: "I know switching is hard. Let us start with five minutes.",
  },
];

export const sprint1ConversationNodes: ConversationNode[] = [
  {
    id: "node_demo_1",
    sessionId: "session_demo_1",
    nodeType: "repair",
    title: "Repair attempt",
    description: "Parent acknowledged the transition and reduced repeated correction.",
    speaker: "parent",
    severity: "low",
    connectedToNodeIds: [],
    detectedAtSec: 120,
    recommendation: "Practice the same repair phrase before homework tomorrow.",
  },
];

export const sprint1Recommendations: Recommendation[] = [
  {
    id: "recommendation_demo_1",
    sessionId: "session_demo_1",
    target: "parent",
    category: "validation",
    problem: "Instruction repeated before validation.",
    whyItMatters: "Validation can reduce escalation and create a clearer boundary.",
    recommendedScript: "I can see this feels hard. We still need to begin.",
    practiceActivity: "Role-play the first two minutes of homework transition.",
    priority: 2,
  },
];

export const sprint1TherapistNotes: TherapistNote[] = [
  {
    id: "therapist_note_demo_1",
    sessionId: "session_demo_1",
    therapistUserId: "user_therapist_1",
    note: "Good candidate for parent repair practice. No diagnosis stored.",
    assignedPractice: "Use one validation phrase before repeating the boundary.",
    createdAt: "2026-05-18T03:25:00.000Z",
  },
];

export const sprint1SessionMetrics: SessionMetric[] = [
  {
    id: "metric_demo_1",
    sessionId: "session_demo_1",
    familyId: "family_demo_1",
    childId: "child_demo_1",
    createdAt: "2026-05-18T03:20:00.000Z",
    situationType: "homework_conflict",
    language: "en-IN",
    parentValidationScore: 62,
    parentEscalationScore: 48,
    childRegulationScore: 58,
    childClarityScore: 55,
    listeningScore: 60,
    repairScore: 64,
    overallEscalationRisk: "medium",
    triggerTags: ["homework", "transition"],
    parentPatternTags: ["repeated_instruction", "late_validation"],
    childPatternTags: ["short_response", "needs_transition_time"],
  },
  {
    id: "metric_demo_2",
    sessionId: "session_demo_2",
    familyId: "family_demo_1",
    childId: "child_demo_1",
    createdAt: "2026-05-25T03:20:00.000Z",
    situationType: "homework_conflict",
    language: "en-IN",
    parentValidationScore: 72,
    parentEscalationScore: 35,
    childRegulationScore: 66,
    childClarityScore: 64,
    listeningScore: 68,
    repairScore: 76,
    overallEscalationRisk: "low",
    triggerTags: ["homework", "transition"],
    parentPatternTags: ["early_validation", "clear_boundary"],
    childPatternTags: ["clearer_request", "recovered_after_pause"],
  },
];

export const sprint1FamilyTrendSnapshot: FamilyTrendSnapshot = {
  id: "trend_demo_1",
  familyId: "family_demo_1",
  childId: "child_demo_1",
  periodType: "weekly",
  periodStart: "2026-05-18T00:00:00.000Z",
  periodEnd: "2026-05-25T23:59:59.000Z",
  sessionCount: 2,
  topTriggers: ["homework", "transition"],
  parentEscalationAverage: 41.5,
  parentValidationAverage: 67,
  childRegulationAverage: 62,
  repairScoreAverage: 70,
  mostImprovedSkill: "escalation rate decreased",
  recommendedFocus: "Continue reinforcing validation before boundary reminders.",
};

export const sprint1LanguagePreference: LanguagePreference = {
  id: "language_preference_demo_1",
  familyId: "family_demo_1",
  userId: "user_parent_1",
  preferredLanguage: "en-IN",
  transcriptLanguage: "en-IN",
  coachingLanguage: "en-IN",
  recommendationLanguage: "en-IN",
  uiLanguage: "en-IN",
  childFriendlyLanguageLevel: "preteen",
};

export const sprint1TranscriptUploads: TranscriptUpload[] = [
  {
    id: "transcript_upload_demo_1",
    sessionId: "session_demo_1",
    transcriptLanguage: "en-IN",
    sourceType: "google_recorder",
    rawText: "Please start your homework now. I know switching is hard.",
    normalizedText: "Please start your homework now. I know switching is hard.",
    createdAt: "2026-05-18T03:12:00.000Z",
  },
];
