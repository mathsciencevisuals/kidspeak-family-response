import { z } from "zod";

export const userRoleSchema = z.enum([
  "super_admin",
  "clinical_admin",
  "therapist",
  "psychologist",
  "parent",
  "child",
  "school_counselor",
  "support_staff",
  "auditor",
  "admin",
]);
export const inputModeSchema = z.enum(["live_audio", "uploaded_audio_transient", "transcript_upload", "manual_text"]);
export const ageRangeSchema = z.enum(["6-8", "9-12", "13-15", "16-18"]);
export const consentTypeSchema = z.enum(["recording", "therapist_share", "data_retention", "research_opt_in"]);
export const consentStatusSchema = z.enum(["granted", "revoked"]);
export const situationTypeSchema = z.enum([
  "homework_conflict",
  "screen_time",
  "anger_tantrum",
  "lying_hiding",
  "low_confidence",
  "sibling_conflict",
  "custom",
]);
export const transcriptStatusSchema = z.enum([
  "not_started",
  "uploaded",
  "transcribing",
  "transcribed",
  "analyzing",
  "analyzed",
  "failed",
]);
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const speakerSchema = z.enum(["parent", "child", "unknown"]);
export const nodeTypeSchema = z.enum([
  "trigger",
  "parent_response",
  "child_response",
  "escalation",
  "shutdown",
  "repair",
  "coaching",
  "risk",
]);
export const recommendationTargetSchema = z.enum(["parent", "child", "therapist", "family"]);
export const recommendationCategorySchema = z.enum([
  "validation",
  "boundary",
  "self_regulation",
  "listening",
  "repair",
  "safety",
  "professional_review",
]);
export const supportedLanguageSchema = z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]);
export const analysisConfidenceSchema = z.enum(["high", "medium", "low"]);
export const periodTypeSchema = z.enum(["weekly", "monthly"]);
export const transcriptUploadSourceTypeSchema = z.enum([
  "manual_paste",
  "phone_recorder_transcript",
  "whatsapp_transcript",
  "google_recorder",
  "iphone_transcript",
  "samsung_recorder",
  "file_upload",
]);
export const childFriendlyLanguageLevelSchema = z.enum(["early_reader", "preteen", "teen", "plain"]);
export const supportedAudioMimeTypeSchema = z.enum([
  "audio/webm",
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
]);

export const isoDateSchema = z.string().datetime();
export const idSchema = z.string().min(1);

export const userSchema = z.object({
  id: idSchema,
  role: userRoleSchema,
  displayName: z.string().min(1),
  email: z.string().email(),
  createdAt: isoDateSchema,
});

export const familySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  ownerUserId: idSchema,
  memberUserIds: z.array(idSchema),
  createdAt: isoDateSchema,
});

export const childProfileSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  displayName: z.string().min(1),
  ageRange: ageRangeSchema,
  preferredLanguage: z.string().min(2),
  notes: z.string(),
  createdAt: isoDateSchema,
});

export const consentRecordSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  childId: idSchema,
  parentUserId: idSchema,
  consentType: consentTypeSchema,
  status: consentStatusSchema,
  grantedAt: isoDateSchema,
  revokedAt: isoDateSchema.optional(),
});

export const conversationSessionSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  childId: idSchema,
  createdByUserId: idSchema,
  situationType: situationTypeSchema,
  language: z.string().min(2),
  durationSeconds: z.number().int().nonnegative(),
  inputMode: inputModeSchema.default("transcript_upload"),
  audioStoragePath: z.string().min(1).nullable().optional(),
  transcriptStatus: transcriptStatusSchema,
  riskLevel: riskLevelSchema,
  overallPattern: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const sessionMetricSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  familyId: idSchema,
  childId: idSchema,
  createdAt: isoDateSchema,
  situationType: situationTypeSchema,
  language: supportedLanguageSchema,
  parentValidationScore: z.number().min(0).max(100),
  parentEscalationScore: z.number().min(0).max(100),
  childRegulationScore: z.number().min(0).max(100),
  childClarityScore: z.number().min(0).max(100),
  listeningScore: z.number().min(0).max(100),
  repairScore: z.number().min(0).max(100),
  overallEscalationRisk: riskLevelSchema,
  triggerTags: z.array(z.string()),
  parentPatternTags: z.array(z.string()),
  childPatternTags: z.array(z.string()),
});

export const familyTrendSnapshotSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  childId: idSchema,
  periodType: periodTypeSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  sessionCount: z.number().int().nonnegative(),
  topTriggers: z.array(z.string()),
  parentEscalationAverage: z.number().min(0).max(100),
  parentValidationAverage: z.number().min(0).max(100),
  childRegulationAverage: z.number().min(0).max(100),
  repairScoreAverage: z.number().min(0).max(100),
  mostImprovedSkill: z.string(),
  recommendedFocus: z.string(),
});

export const languagePreferenceSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  userId: idSchema,
  preferredLanguage: supportedLanguageSchema,
  transcriptLanguage: supportedLanguageSchema,
  coachingLanguage: supportedLanguageSchema,
  recommendationLanguage: supportedLanguageSchema,
  uiLanguage: supportedLanguageSchema,
  childFriendlyLanguageLevel: childFriendlyLanguageLevelSchema,
});

export const transcriptUploadSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  transcriptLanguage: supportedLanguageSchema.default("en-IN"),
  sourceType: transcriptUploadSourceTypeSchema,
  rawText: z.string(),
  normalizedText: z.string(),
  englishTranslationForAnalysis: z.string().optional(),
  createdAt: isoDateSchema,
});

export const audioUploadSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  fileName: z.string().min(1),
  mimeType: supportedAudioMimeTypeSchema,
  fileSizeBytes: z.number().int().positive(),
  estimatedDurationSeconds: z.number().int().positive(),
  storagePath: z.string().min(1).nullable(),
  retentionDays: z.number().int().nonnegative(),
  audioPersisted: z.boolean().default(false),
  createdAt: isoDateSchema,
});

export const audioProcessingEventSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  inputMode: inputModeSchema,
  fileName: z.string().optional(),
  audioPersisted: z.boolean(),
  storagePath: z.string().min(1).nullable(),
  provider: z.enum(["mock", "speech_to_text"]),
  status: z.enum(["received", "transcribed", "discarded", "failed"]),
  createdAt: isoDateSchema,
});

export const conversationTurnSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  speaker: speakerSchema,
  startTimeSec: z.number().nonnegative(),
  endTimeSec: z.number().nonnegative(),
  text: z.string(),
  originalText: z.string().optional(),
  translatedText: z.string().optional(),
  originalLanguage: supportedLanguageSchema.optional(),
  emotionLabel: z.string(),
  toneLabel: z.string(),
  intentLabel: z.string(),
  conversationAct: z.string(),
  escalationScore: z.number().min(0).max(1),
  repairOpportunity: z.string(),
  suggestedReframe: z.string(),
});

export const conversationNodeSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  nodeType: nodeTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  speaker: speakerSchema,
  severity: riskLevelSchema,
  connectedToNodeIds: z.array(idSchema),
  detectedAtSec: z.number().nonnegative(),
  recommendation: z.string(),
  originalUtterance: z.string().optional(),
  translatedMeaning: z.string().optional(),
  detectedPattern: z.string().optional(),
  analysisConfidence: analysisConfidenceSchema.optional(),
  originalLanguage: supportedLanguageSchema.optional(),
  recommendationLanguage: supportedLanguageSchema.optional(),
});

export const recommendationSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  target: recommendationTargetSchema,
  category: recommendationCategorySchema,
  problem: z.string(),
  whyItMatters: z.string(),
  recommendedScript: z.string(),
  practiceActivity: z.string(),
  priority: z.number().int().min(1).max(5),
});

export const therapistNoteSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  therapistUserId: idSchema,
  note: z.string(),
  assignedPractice: z.string(),
  createdAt: isoDateSchema,
});

export const createSessionSchema = conversationSessionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createConsentRecordSchema = consentRecordSchema.omit({
  id: true,
  status: true,
  grantedAt: true,
  revokedAt: true,
});

export const createTherapistNoteSchema = therapistNoteSchema.omit({
  id: true,
  createdAt: true,
});

export const saveSessionMetricSchema = sessionMetricSchema.omit({
  id: true,
  createdAt: true,
});

export const saveLanguagePreferenceSchema = languagePreferenceSchema.omit({
  id: true,
});

export const saveTranscriptUploadSchema = transcriptUploadSchema.omit({
  id: true,
  createdAt: true,
});

export const saveAudioUploadSchema = audioUploadSchema.omit({
  id: true,
  storagePath: true,
  retentionDays: true,
  audioPersisted: true,
  createdAt: true,
});

export const rolePermissionSchema = z.object({
  id: idSchema,
  role: userRoleSchema,
  permission: z.string().min(1),
  description: z.string(),
});

export const promptVersionSchema = z.object({
  id: idSchema,
  version: z.string().min(1),
  language: supportedLanguageSchema,
  status: z.enum(["draft", "approved", "retired"]),
  content: z.string(),
  reviewedBy: idSchema.optional(),
  safetyNotes: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const safetyRuleSchema = z.object({
  id: idSchema,
  phrase: z.string().min(1),
  language: supportedLanguageSchema,
  category: z.enum([
    "self_harm",
    "harm_to_others",
    "abuse_disclosure",
    "severe_fear",
    "violence",
    "parent_aggression",
    "child_extreme_distress",
    "professional_review",
  ]),
  severity: riskLevelSchema,
  blockNormalCoaching: z.boolean(),
  requiresProfessionalReview: z.boolean(),
  responseMessage: z.string(),
});

export const auditLogSchema = z.object({
  id: idSchema,
  actorUserId: idSchema,
  eventType: z.string().min(1),
  targetId: z.string().optional(),
  breakGlassReason: z.string().optional(),
  createdAt: isoDateSchema,
});

export const costUsageEventSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  eventType: z.string().min(1),
  estimatedCost: z.number().nonnegative(),
  createdAt: isoDateSchema,
});

export const therapistAssignmentSchema = z.object({
  id: idSchema,
  therapistUserId: idSchema,
  familyId: idSchema,
  consentRecordId: idSchema,
  active: z.boolean(),
  createdAt: isoDateSchema,
});

export type User = z.infer<typeof userSchema>;
export type Family = z.infer<typeof familySchema>;
export type ChildProfile = z.infer<typeof childProfileSchema>;
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export type ConversationSession = z.infer<typeof conversationSessionSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export type ConversationNode = z.infer<typeof conversationNodeSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type TherapistNote = z.infer<typeof therapistNoteSchema>;
export type SessionMetric = z.infer<typeof sessionMetricSchema>;
export type FamilyTrendSnapshot = z.infer<typeof familyTrendSnapshotSchema>;
export type LanguagePreference = z.infer<typeof languagePreferenceSchema>;
export type TranscriptUpload = z.infer<typeof transcriptUploadSchema>;
export type AudioUpload = z.infer<typeof audioUploadSchema>;
export type AudioProcessingEvent = z.infer<typeof audioProcessingEventSchema>;
export type RolePermission = z.infer<typeof rolePermissionSchema>;
export type PromptVersion = z.infer<typeof promptVersionSchema>;
export type SafetyRule = z.infer<typeof safetyRuleSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type CostUsageEvent = z.infer<typeof costUsageEventSchema>;
export type TherapistAssignment = z.infer<typeof therapistAssignmentSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CreateConsentRecordInput = z.infer<typeof createConsentRecordSchema>;
export type CreateTherapistNoteInput = z.infer<typeof createTherapistNoteSchema>;
export type SaveSessionMetricInput = z.infer<typeof saveSessionMetricSchema>;
export type SaveLanguagePreferenceInput = z.infer<typeof saveLanguagePreferenceSchema>;
export type SaveTranscriptUploadInput = z.infer<typeof saveTranscriptUploadSchema>;
export type SaveAudioUploadInput = z.infer<typeof saveAudioUploadSchema>;
export type PeriodType = z.infer<typeof periodTypeSchema>;
