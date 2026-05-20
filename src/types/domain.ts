export type SupportedLanguageCode = "en-IN" | "hi-IN" | "te-IN" | "ta-IN";

export type ProductNameOption = {
  id: string;
  name: string;
  positioning: string;
  active: boolean;
};

export type LanguagePreference = {
  familyId: string;
  primaryLanguage: SupportedLanguageCode;
  secondaryLanguages: SupportedLanguageCode[];
  transcriptLanguage?: SupportedLanguageCode;
  coachingTone: "gentle" | "direct" | "therapist-reviewed";
  updatedAt: string;
};

export type TranscriptUpload = {
  id: string;
  familyId: string;
  sessionId?: string;
  source:
    | "phone-recorder"
    | "whatsapp-transcription"
    | "google-recorder"
    | "samsung-recorder"
    | "iphone-transcription"
    | "manual-notes";
  language: SupportedLanguageCode;
  pastedText?: string;
  fileName?: string;
  status: "draft" | "ready-for-analysis" | "analysed";
  avoidsTranscriptionCost: boolean;
  createdAt: string;
};

export type AudioUpload = {
  id: string;
  familyId: string;
  fileName: string;
  sourceDevice: "mobile-recorder" | "whatsapp-export" | "other";
  languageHint: SupportedLanguageCode;
  rawAudioRetentionHours: number;
  transcriptionStatus: "not-started" | "queued" | "complete" | "skipped";
  createdAt: string;
};

export type SessionMetric = {
  sessionId: string;
  familyId: string;
  date: string;
  escalationRate: number;
  parentValidationScore: number;
  childRegulationScore: number;
  repairScore: number;
  triggerFrequency: number;
  calmnessScore: number;
  professionalReviewRecommended: boolean;
};

export type FamilyTrendSnapshot = {
  id: string;
  familyId: string;
  windowStart: string;
  windowEnd: string;
  escalationRateTrend: "improving" | "steady" | "needs-attention";
  parentValidationImprovement: number;
  childRegulationImprovement: number;
  repairScoreTrend: number[];
  triggerFrequencyByType: Record<string, number>;
  generatedAt: string;
};

export type LiveCoachNudge = {
  id: string;
  timestamp: string;
  triggerPattern: string;
  nudgeText: string;
  target: "parent" | "child";
  severity: "low" | "medium" | "high" | "critical";
  source: "rule_based" | "ai";
};

export type TrendInsight = {
  id: string;
  familyId: string;
  metric:
    | "escalation-rate"
    | "parent-validation"
    | "child-regulation"
    | "repair-score"
    | "trigger-frequency";
  label: string;
  observation: string;
  coachingOpportunity: string;
  riskLevel: "low" | "medium" | "professional-review";
};

export type HistorySession = {
  id: string;
  date: string;
  child: string;
  situation: string;
  language: SupportedLanguageCode;
  riskLevel: "low" | "medium" | "high" | "critical";
  parentCoachingFocus: string;
  childCoachingFocus: string;
  repairScore: number;
  escalationRisk: number;
  status: "analyzed" | "pending-review" | "ready-for-analysis";
};

export type LongitudinalTrendPoint = {
  sessionId: string;
  date: string;
  escalationRate: number;
  parentValidationScore: number;
  childRegulationScore: number;
  repairScore: number;
  trigger: string;
  repairAttempts: number;
};

export type Session = {
  id: string;
  title: string;
  date: string;
  language: SupportedLanguageCode;
  source: "record" | "audio-upload" | "transcript-upload";
  summary: string;
  emotionalSignals: string[];
  communicationPatterns: string[];
  coachingOpportunities: string[];
  metric: SessionMetric;
};

export type RouteDefinition = {
  label: string;
  path: string;
  purpose: string;
};

export type CompetitiveProductCapability = "yes" | "partial" | "planned" | "unknown" | "to-verify";

export type CompetitiveProduct = {
  product: string;
  behaviourAnalysis: CompetitiveProductCapability;
  parentCoaching: CompetitiveProductCapability;
  childSelfView: CompetitiveProductCapability;
  voiceConversationAnalysis: CompetitiveProductCapability;
  nlpConversationGraph: CompetitiveProductCapability;
  therapistDashboard: CompetitiveProductCapability;
  indiaLanguageSupport: CompetitiveProductCapability;
  longitudinalTracking: CompetitiveProductCapability;
  realTimeCoaching: CompetitiveProductCapability;
};
