import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  audioUploads,
  competitiveProducts,
  costPrinciples,
  historySessions,
  indiaGtmSegments,
  languagePreference,
  liveCoachNudges,
  longitudinalTrendPoints,
  moatRoadmap,
  parentRoutes,
  platformAdminRoutes,
  productNames,
  safetyPrinciples,
  sessions,
  therapistAdminRoutes,
  transcriptUploads,
  whitespaceLayers,
} from "./data/mockData";
import { getLanguageConfig, languageConfigs, type SupportedLanguage } from "./localisation/languages";
import {
  getTherapistFamilySummary,
  getTherapistHome,
  getTherapistSessionReview,
  createExportSummary,
  therapistFamilies,
  therapistSessions,
} from "./services/therapistDashboard";
import type { ChildAnalysis } from "./services/childCoaching";
import type { ParentAnalysis } from "./services/parentCoaching";
import { assessSafetyRisk, type RiskAssessment } from "./services/safetyRiskClassifier";
import {
  audioRetentionOptions,
  childFriendlyNotice,
  privacySafetyPrinciples,
  transcriptRetentionOptions,
} from "./services/privacyControls";
import { getCostDashboardSnapshot } from "./services/costGuardrails";
import { getLiveCoachSettings, simulateLiveCoach } from "./services/liveCoach";
import type { ConversationNode, ConversationSession, ConversationTurn } from "./types/sprint1";
import type { CompetitiveProduct, HistorySession, LongitudinalTrendPoint, RouteDefinition, Session } from "./types/domain";

type AppRole =
  | "parent"
  | "therapist"
  | "psychologist"
  | "clinical_admin"
  | "super_admin"
  | "support_staff"
  | "auditor";

type NavItem = RouteDefinition & {
  roles: AppRole[];
  sensitive?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

type GraphAnalysisResponse = {
  nodes: ConversationNode[];
  confidence: "high" | "medium" | "low";
  originalLanguage: SupportedLanguage;
  humanReviewRecommended: boolean;
  aiInferenceUsed: boolean;
  cacheHit: boolean;
  cachedBadge: string;
  generatedAt: string;
  analysisVersion: string;
  regenerateAllowed: boolean;
};

type ParentAnalysisResponse = ParentAnalysis & {
  cacheHit: boolean;
  cachedBadge: string;
  generatedAt: string;
  analysisVersion: string;
  regenerateAllowed: boolean;
};

type ChildAnalysisResponse = ChildAnalysis & {
  cacheHit: boolean;
  cachedBadge: string;
  generatedAt: string;
  analysisVersion: string;
  regenerateAllowed: boolean;
};

type RiskAssessmentResponse = {
  assessment: RiskAssessment;
  cacheHit: boolean;
  cachedBadge: string;
  generatedAt: string;
  analysisVersion: string;
  normalCoachingPrimary: boolean;
  message: string;
};

type RuntimeSessionBundle = {
  session: ConversationSession;
  turns: ConversationTurn[];
  speakerTagsDetected: boolean;
  graph: GraphAnalysisResponse | null;
  parentAnalysis: ParentAnalysisResponse | null;
  childAnalysis: ChildAnalysisResponse | null;
  riskAssessment: RiskAssessmentResponse | null;
};

const runtimeSessionStoragePrefix = "kidspeak-runtime-session:";
const runtimeLatestSessionKey = "kidspeak-runtime-latest-session";
const AUTH_STORAGE_KEY = "kidspeak-auth-session";

type AuthSession = {
  token: string;
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  familyId: string | null;
};

function loadAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch { return null; }
}

function saveAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function makeAuthHeaders(session: AuthSession) {
  return {
    authorization: `Bearer ${session.token}`,
    "x-user-id": session.userId,
    "x-user-role": session.role,
  };
}

const apiAuthHeaders = {
  authorization: "Bearer demo-parent-token",
  "x-user-id": "parent_demo_1",
  "x-user-role": "parent",
};

const demoSessionId = "session-001";

const parentRoles: AppRole[] = ["parent", "super_admin"];
const therapistRoles: AppRole[] = ["therapist", "psychologist", "clinical_admin", "super_admin"];
const adminRoles: AppRole[] = ["super_admin"];
const adminHomeRoles: AppRole[] = ["super_admin", "clinical_admin"];
const languageAdminRoles: AppRole[] = ["super_admin", "clinical_admin", "therapist"];
const safetyRulesAdminRoles: AppRole[] = ["super_admin", "clinical_admin", "therapist"];
const promptAdminRoles: AppRole[] = ["super_admin", "clinical_admin", "therapist", "auditor"];
const supportRoles: AppRole[] = ["support_staff", "super_admin"];
const settingsRoles: AppRole[] = ["parent", "super_admin"];

const navGroups: NavGroup[] = [
  {
    title: "Parent Workspace",
    items: [
      { label: "Dashboard", path: "/dashboard", purpose: "Overview for intake, no-raw-audio policy, safety posture, and low-cost MVP controls.", roles: ["parent", "super_admin", "support_staff"] },
      { label: "Record Live Session", path: "/record", purpose: "Capture live audio-to-text with explicit consent and no raw-audio storage.", roles: parentRoles, sensitive: true },
      { label: "Upload Audio", path: "/upload-audio", purpose: "Transcribe an uploaded mobile recording transiently, then discard raw audio.", roles: parentRoles, sensitive: true },
      { label: "Upload Transcript", path: "/upload-transcript", purpose: "Paste or upload transcript text to skip speech-to-text cost.", roles: parentRoles, sensitive: true },
      { label: "Sessions", path: "/sessions", purpose: "Show analysed coaching sessions for the family.", roles: parentRoles, sensitive: true },
      { label: "History", path: "/history", purpose: "Show previous sessions and progress.", roles: parentRoles, sensitive: true },
      { label: "Trends", path: "/history/trends", purpose: "Show escalation, repair, validation, and regulation trends over time.", roles: parentRoles, sensitive: true },
    ],
  },
  {
    title: "Analysis",
    items: [
      { label: "Conversation Graph", path: "/sessions/[id]/graph", purpose: "Map parent and child turns into communication patterns and coaching opportunities.", roles: parentRoles, sensitive: true },
      { label: "Parent Coaching", path: "/sessions/[id]/parent", purpose: "Support parent reflection using coaching language, not diagnosis.", roles: parentRoles, sensitive: true },
      { label: "Kid Self-Coaching", path: "/sessions/[id]/child", purpose: "Age-aware reflection tools for child regulation practice.", roles: parentRoles, sensitive: true },
      { label: "Safety Review", path: "/sessions/[id]/safety", purpose: "Route concerning language to adult or professional attention before normal coaching.", roles: parentRoles, sensitive: true },
    ],
  },
  {
    title: "Therapist",
    items: [
      { label: "Therapist Dashboard", path: "/therapist", purpose: "Professional workspace for assigned consented families.", roles: therapistRoles, sensitive: true },
      { label: "Therapist Admin Home", path: "/therapist/admin", purpose: "Professional case operations, assigned family review, and templates.", roles: therapistRoles, sensitive: true },
      { label: "Families", path: "/therapist/admin/families", purpose: "Show only consented and assigned families.", roles: therapistRoles, sensitive: true },
      { label: "Cases", path: "/therapist/admin/cases", purpose: "Manage active cases, therapist notes, and practice assignments.", roles: therapistRoles, sensitive: true },
      { label: "Session Review", path: "/therapist/admin/session-review", purpose: "Review transcript, graph, signals, risk, and professional summary.", roles: therapistRoles, sensitive: true },
      { label: "Risk Queue", path: "/therapist/admin/risk-queue", purpose: "Review sessions where professional attention is recommended.", roles: therapistRoles, sensitive: true },
      { label: "Practice Library", path: "/therapist/admin/practice-library", purpose: "Manage assigned home practice templates.", roles: therapistRoles, sensitive: true },
      { label: "Progress Reports", path: "/therapist/admin/progress-reports", purpose: "Prepare professional progress summaries from cached observations.", roles: therapistRoles, sensitive: true },
      { label: "Notes Templates", path: "/therapist/admin/notes-templates", purpose: "Create reusable therapist note templates.", roles: therapistRoles, sensitive: true },
    ],
  },
  {
    title: "Platform Admin",
    items: [
      { label: "Admin Home", path: "/admin", purpose: "Governance home for RBAC, safety, prompts, privacy, infrastructure, cost, and audit controls.", roles: adminHomeRoles },
      { label: "Users", path: "/admin/users", purpose: "Manage user accounts and access posture.", roles: adminRoles },
      { label: "Roles", path: "/admin/roles", purpose: "Manage role permissions and break-glass policy.", roles: adminHomeRoles },
      { label: "Families", path: "/admin/families", purpose: "Govern family records without normal raw-audio access.", roles: adminRoles },
      { label: "Therapists", path: "/admin/therapists", purpose: "Manage therapist assignments and consent-scoped access.", roles: adminRoles },
      { label: "Languages", path: "/admin/languages", purpose: "Manage India-first language dictionaries and child-friendly wording.", roles: languageAdminRoles },
      { label: "Prompts", path: "/admin/prompts", purpose: "Manage approved prompt versions and safety notes.", roles: promptAdminRoles },
      { label: "Safety Rules", path: "/admin/safety-rules", purpose: "Manage multilingual safety rules and professional review responses.", roles: safetyRulesAdminRoles },
      { label: "Privacy", path: "/admin/privacy", purpose: "Manage consent templates, retention, export, and deletion workflows.", roles: ["super_admin", "clinical_admin", "auditor"] },
      { label: "Compliance", path: "/admin/compliance", purpose: "Review compliance controls, audit logs, and no-audio-storage policy.", roles: ["super_admin", "clinical_admin", "auditor"] },
      { label: "Infrastructure", path: "/admin/infrastructure", purpose: "Show Cloud Run, Firestore, auth, STT, AI, and mock-mode status.", roles: [...adminRoles, ...supportRoles] },
      { label: "Cost", path: "/admin/cost", purpose: "Monitor sessions, STT minutes, cached AI results, limits, and estimated cost.", roles: adminHomeRoles },
      { label: "Audit Logs", path: "/admin/audit-logs", purpose: "Review governance, consent, and break-glass audit events.", roles: [...adminRoles, "auditor"] },
      { label: "Feature Flags", path: "/admin/feature-flags", purpose: "Manage MVP feature flags, including STORE_RAW_AUDIO=false.", roles: [...adminRoles, ...supportRoles] },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Consent", path: "/settings/consent", purpose: "Grant or revoke recording, therapist sharing, data retention, and research opt-in consent.", roles: settingsRoles, sensitive: true },
      { label: "Privacy", path: "/settings/privacy", purpose: "Show privacy principles, exports, deletion controls, and child-friendly notices.", roles: settingsRoles, sensitive: true },
      { label: "Language", path: "/settings/language", purpose: "Set UI, transcript, recommendation, and child-friendly language preferences.", roles: settingsRoles, sensitive: true },
      { label: "Therapist Sharing", path: "/settings/therapist-sharing", purpose: "Manage consented therapist sharing and assignments.", roles: settingsRoles, sensitive: true },
      { label: "Export Data", path: "/settings/export-data", purpose: "Export summaries, transcript turns, recommendations, and parent-visible therapist notes.", roles: settingsRoles, sensitive: true },
      { label: "Delete Data", path: "/settings/delete-data", purpose: "Request one-session, child-profile, or all-family data deletion.", roles: settingsRoles, sensitive: true },
    ],
  },
];

const languages = languageConfigs.map((language) => ({
  code: language.languageCode,
  label: language.displayName,
}));

const defaultChildOptions = [
  { id: "child_demo_1", label: "Aarav, 9-12" },
  { id: "child_demo_2", label: "Mira, 6-8" },
];

function getChildOptions(): Array<{ id: string; label: string }> {
  try {
    const raw = localStorage.getItem("family_profile");
    if (raw) {
      const profile = JSON.parse(raw) as { children?: string[] };
      const saved = (profile.children ?? []).filter(Boolean);
      if (saved.length > 0) return saved.map((name, i) => ({ id: `child_${i}`, label: name }));
    }
  } catch {}
  return defaultChildOptions;
}

function getDefaultSituation(): string {
  try {
    const raw = localStorage.getItem("family_profile");
    if (raw) {
      const profile = JSON.parse(raw) as { defaultSituation?: string };
      return profile.defaultSituation ?? "homework_conflict";
    }
  } catch {}
  return "homework_conflict";
}

const situationOptions = [
  { id: "homework_conflict", label: "Homework conflict" },
  { id: "screen_time", label: "Screen time" },
  { id: "anger_tantrum", label: "Anger / tantrum" },
  { id: "lying_hiding", label: "Lying / hiding" },
  { id: "low_confidence", label: "Low confidence" },
  { id: "sibling_conflict", label: "Sibling conflict" },
  { id: "custom", label: "Custom" },
];

const supportedAudioFormats = "audio/webm, audio/wav, audio/mp3, audio/mpeg, audio/mp4, audio/m4a";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...apiAuthHeaders,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parsing failures and use the HTTP status text.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function apiMaybeJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await apiJson<T>(path, init);
  } catch (error) {
    if (error instanceof Error && /404|not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

function saveRuntimeSession(bundle: RuntimeSessionBundle): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${runtimeSessionStoragePrefix}${bundle.session.id}`, JSON.stringify(bundle));
  window.localStorage.setItem(runtimeLatestSessionKey, bundle.session.id);
}

function loadRuntimeSession(sessionId: string): RuntimeSessionBundle | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(`${runtimeSessionStoragePrefix}${sessionId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RuntimeSessionBundle;
  } catch {
    return null;
  }
}

function latestRuntimeSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(runtimeLatestSessionKey);
}

function scoreRowsFromParentAnalysis(score: ParentAnalysis["score"]): Array<{ label: string; value: number }> {
  return [
    { label: "Validation skill", value: score.validationSkill },
    { label: "Boundary clarity", value: score.boundaryClarity },
    { label: "Listening quality", value: score.listeningQuality },
    { label: "Escalation control", value: score.escalationControl },
    { label: "Repair attempt", value: score.repairAttempt },
    { label: "Emotional regulation", value: score.emotionalRegulation },
  ];
}

function asSupportedLanguage(value: string): SupportedLanguage {
  return ["en-IN", "hi-IN", "te-IN", "ta-IN"].includes(value) ? value as SupportedLanguage : "en-IN";
}

function sessionTitle(session: ConversationSession): string {
  return `${session.situationType.replaceAll("_", " ")} · ${new Date(session.createdAt).toLocaleDateString()}`;
}

function sessionSummary(session: ConversationSession, parentAnalysis?: ParentAnalysisResponse | null): string {
  return parentAnalysis?.patterns.length
    ? `Patterns: ${parentAnalysis.patterns.join(", ")}`
    : session.overallPattern;
}

function sessionSource(inputMode: ConversationSession["inputMode"]): Session["source"] {
  if (inputMode === "live_audio") {
    return "record";
  }
  if (inputMode === "uploaded_audio_transient") {
    return "audio-upload";
  }
  return "transcript-upload";
}

function toSessionCard(bundle: RuntimeSessionBundle): Session {
  const parentAnalysis = bundle.parentAnalysis;
  const childAnalysis = bundle.childAnalysis;
  const risk = bundle.riskAssessment?.assessment;
  return {
    id: bundle.session.id,
    title: sessionTitle(bundle.session),
    date: bundle.session.createdAt,
    language: asSupportedLanguage(bundle.session.language),
    source: sessionSource(bundle.session.inputMode),
    summary: sessionSummary(bundle.session, parentAnalysis),
    emotionalSignals: childAnalysis?.feelings ?? [],
    communicationPatterns: parentAnalysis?.patterns ?? [],
    coachingOpportunities: [
      ...(parentAnalysis?.patterns ?? []),
      ...(childAnalysis?.feelings ?? []).map((feeling) => `child: ${feeling}`),
    ].slice(0, 4),
    metric: {
      sessionId: bundle.session.id,
      familyId: bundle.session.familyId,
      date: bundle.session.createdAt,
      escalationRate: risk?.riskLevel === "critical" ? 0.9 : risk?.riskLevel === "high" ? 0.7 : risk?.riskLevel === "medium" ? 0.4 : 0.2,
      parentValidationScore: parentAnalysis?.score.validationSkill ?? 0,
      childRegulationScore: childAnalysis?.feelings.length ? 60 : 40,
      repairScore: parentAnalysis?.score.repairAttempt ?? 0,
      triggerFrequency: bundle.graph?.nodes.length ?? 0,
      calmnessScore: parentAnalysis?.score.emotionalRegulation ?? 0,
      professionalReviewRecommended: parentAnalysis?.professionalReviewRecommended ?? false,
    },
  };
}

function toHistorySession(bundle: RuntimeSessionBundle): HistorySession {
  const parentAnalysis = bundle.parentAnalysis;
  const childAnalysis = bundle.childAnalysis;
  const risk = bundle.riskAssessment?.assessment;
  return {
    id: bundle.session.id,
    date: new Date(bundle.session.createdAt).toLocaleDateString(),
    child: bundle.session.childId,
    situation: bundle.session.situationType.replaceAll("_", " "),
    language: asSupportedLanguage(bundle.session.language),
    riskLevel: risk?.riskLevel ?? bundle.session.riskLevel,
    parentCoachingFocus: parentAnalysis?.patterns[0] ?? "Awaiting parent analysis",
    childCoachingFocus: childAnalysis?.feelings[0] ?? "Awaiting child analysis",
    repairScore: parentAnalysis?.score.repairAttempt ?? 0,
    escalationRisk: risk?.riskLevel === "critical" ? 90 : risk?.riskLevel === "high" ? 70 : risk?.riskLevel === "medium" ? 40 : 20,
    status: bundle.session.transcriptStatus === "analyzed" ? "analyzed" : bundle.session.transcriptStatus === "transcribed" ? "ready-for-analysis" : "pending-review",
  };
}

async function fetchRuntimeSessionBundle(sessionId: string): Promise<RuntimeSessionBundle> {
  const session = await apiJson<ConversationSession>(`/api/sessions/${sessionId}`);
  const [turns, nodes, parentAnalysis, childAnalysis, storedRiskAssessment] = await Promise.all([
    apiJson<ConversationTurn[]>(`/api/sessions/${sessionId}/turns`),
    apiMaybeJson<ConversationNode[]>(`/api/sessions/${sessionId}/nodes`),
    apiMaybeJson<ParentAnalysisResponse>(`/api/sessions/${sessionId}/parent-analysis`),
    apiMaybeJson<ChildAnalysisResponse>(`/api/sessions/${sessionId}/child-analysis`),
    apiMaybeJson<RiskAssessment>(`/api/sessions/${sessionId}/risk-assessment`),
  ]);

  const bundle: RuntimeSessionBundle = {
    session,
    turns,
    speakerTagsDetected: turns.every((turn) => turn.speaker !== "unknown"),
    graph: nodes ? {
      nodes,
      confidence: nodes.some((node) => node.analysisConfidence === "high") ? "high" : nodes.some((node) => node.analysisConfidence === "medium") ? "medium" : "low",
      originalLanguage: asSupportedLanguage(session.language),
      humanReviewRecommended: nodes.some((node) => node.analysisConfidence === "low"),
      aiInferenceUsed: false,
      cacheHit: true,
      cachedBadge: "stored",
      generatedAt: session.updatedAt,
      analysisVersion: "stored-session-data",
      regenerateAllowed: false,
    } : null,
    parentAnalysis,
    childAnalysis,
    riskAssessment: storedRiskAssessment ? {
      assessment: storedRiskAssessment,
      cacheHit: true,
      cachedBadge: "stored",
      generatedAt: session.updatedAt,
      analysisVersion: "stored-session-data",
      normalCoachingPrimary: !storedRiskAssessment.blockNormalCoaching,
      message: storedRiskAssessment.recommendedAction,
    } : null,
  };

  saveRuntimeSession(bundle);
  return bundle;
}

async function runFullAnalysisForSession(
  session: ConversationSession,
  transcriptLanguage: SupportedLanguage,
  recommendationLanguage: SupportedLanguage,
): Promise<RuntimeSessionBundle> {
  const graph = await apiJson<GraphAnalysisResponse>(`/api/sessions/${session.id}/analysis/run`, {
    method: "POST",
    body: JSON.stringify({
      languageCode: transcriptLanguage,
      coachingLanguage: recommendationLanguage,
    }),
  });

  const [turns, parentAnalysis, childAnalysis, riskAssessment] = await Promise.all([
    apiJson<ConversationTurn[]>(`/api/sessions/${session.id}/turns`),
    apiJson<ParentAnalysisResponse>(`/api/sessions/${session.id}/parent-analysis`),
    apiJson<ChildAnalysisResponse>(`/api/sessions/${session.id}/child-analysis`),
    apiJson<RiskAssessmentResponse>(`/api/sessions/${session.id}/risk-assessment`, {
      method: "POST",
      body: JSON.stringify({ geminiSafetyAnalysisEnabled: false }),
    }),
  ]);

  const bundle: RuntimeSessionBundle = {
    session,
    turns,
    speakerTagsDetected: turns.every((turn) => turn.speaker !== "unknown"),
    graph,
    parentAnalysis,
    childAnalysis,
    riskAssessment,
  };

  saveRuntimeSession(bundle);
  return bundle;
}

type PrivacyAuditLogItem = {
  id: string;
  familyId: string;
  sessionId?: string;
  eventType: string;
  actorUserId: string;
  createdAt: string;
  details: string;
};

type ConsentRecordItem = {
  id: string;
  familyId: string;
  childId: string;
  parentUserId: string;
  consentType: string;
  status: string;
  grantedAt: string;
  revokedAt?: string;
};

async function fetchAdminPrivacySnapshot() {
  const [familyOneConsents, familyTwoConsents, familyOneAudit, familyTwoAudit] = await Promise.all([
    apiJson<ConsentRecordItem[]>("/api/privacy/consents?familyId=family-demo-1", {
      headers: { "x-user-id": "admin_demo_1", "x-user-role": "admin" },
    }),
    apiJson<ConsentRecordItem[]>("/api/privacy/consents?familyId=family-demo-2", {
      headers: { "x-user-id": "admin_demo_1", "x-user-role": "admin" },
    }),
    apiJson<PrivacyAuditLogItem[]>("/api/audit-logs?familyId=family-demo-1", {
      headers: { "x-user-id": "admin_demo_1", "x-user-role": "admin" },
    }),
    apiJson<PrivacyAuditLogItem[]>("/api/audit-logs?familyId=family-demo-2", {
      headers: { "x-user-id": "admin_demo_1", "x-user-role": "admin" },
    }),
  ]);

  return {
    consents: [...familyOneConsents, ...familyTwoConsents],
    auditEvents: [...familyOneAudit, ...familyTwoAudit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

const liveCoachPrinciples = [
  "Simulation-first.",
  "Consent-first.",
  "Rule-based nudges first.",
  "No always-on recording.",
  "Disabled by default.",
];

const multilingualGraphNodes = [
  {
    originalUtterance: "tum kabhi nahi sunte",
    translatedMeaning: "you never listen",
    detectedPattern: "parent_escalation",
    recommendation: "I hear this is frustrating. Let us set one clear boundary respectfully.",
    confidence: "high",
    originalLanguage: "hi-IN",
  },
  {
    originalUtterance: "school pidikkala",
    translatedMeaning: "I do not like school",
    detectedPattern: "child_reaction",
    recommendation: "Reflect the feeling first, then ask what one small next step would help.",
    confidence: "high",
    originalLanguage: "ta-IN",
  },
  {
    originalUtterance: "Mixed local phrase without a dictionary match",
    translatedMeaning: "Not available",
    detectedPattern: "Needs human review",
    recommendation: "Review this turn with context before making a coaching conclusion.",
    confidence: "low",
    originalLanguage: "te-IN",
  },
];

const safetyDemoTurns: ConversationTurn[] = [
  {
    id: "turn_safety_1",
    sessionId: "session-001",
    speaker: "child",
    startTimeSec: 12,
    endTimeSec: 16,
    text: "Nobody loves me when homework starts.",
    emotionLabel: "sad",
    toneLabel: "distressed",
    intentLabel: "seeking_help",
    conversationAct: "disclosure",
    escalationScore: 0.7,
    repairOpportunity: "pause and support",
    suggestedReframe: "I feel sad and I need help starting.",
  },
];

const parentAnalysisMock = {
  patterns: [
    "Correction before connection",
    "Global criticism",
    "Threat-based boundary",
    "Calm validation",
    "Successful repair attempt",
  ],
  scores: [
    { label: "Validation skill", value: 62 },
    { label: "Boundary clarity", value: 58 },
    { label: "Listening quality", value: 54 },
    { label: "Escalation control", value: 46 },
    { label: "Repair attempt", value: 72 },
    { label: "Emotional regulation", value: 60 },
  ],
  phraseComparison: {
    original: "You are always lazy.",
    detected: "Global criticism.",
    impact: "Child became defensive and stopped explaining difficulty.",
    better: "I see the homework is incomplete. What part felt hard?",
  },
  reviewRecommended: false,
};

const parentPracticePlan = [
  "Day 1: One validation sentence before correction",
  "Day 2: Replace labels with observations",
  "Day 3: Ask one curious question",
  "Day 4: Use calm boundary",
  "Day 5: Avoid threats; use predictable consequence",
  "Day 6: Listen for 30 seconds without interrupting",
  "Day 7: Review improvement",
];

const childFeelings = ["angry", "frustrated", "sad", "scared", "confused", "embarrassed", "jealous", "tired"];

const childPracticeScenarios = [
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

const kidBadges = ["I paused", "I named my feeling", "I asked for help", "I listened", "I repaired"];

const adminDashboardMock = {
  platformStatus: [
    { label: "Cloud Run API status", status: "healthy", detail: "Requests served on demand" },
    { label: "Firestore status", status: "healthy", detail: "MVP primary data store" },
    { label: "Firebase Auth status", status: "healthy", detail: "Auth required for sensitive routes" },
    { label: "Speech-to-Text status", status: "mock", detail: "Real STT disabled in demo mode" },
    { label: "Gemini/Vertex AI status", status: "guarded", detail: "User-triggered only" },
    { label: "Redis/Memorystore status", status: "disabled", detail: "Disabled unless ENABLE_REDIS=true" },
    { label: "Mock mode status", status: "enabled", detail: "Local demo data active" },
    { label: "No-audio-storage status", status: "enforced", detail: "STORE_RAW_AUDIO=false" },
  ],
  usage: {
    sessionsCreatedToday: 12,
    transcriptOnlySessions: 7,
    liveAudioSessions: 3,
    transientAudioUploads: 2,
    sttMinutesProcessed: 18,
    geminiCalls: 4,
    cachedAiResults: 21,
    highRiskSessions: 1,
    therapistReviewsPending: 3,
  },
  privacy: {
    rawAudioStored: 0,
    audioPersisted: false,
    pendingDeletionRequests: 2,
    consentAcceptanceRate: "86%",
    therapistSharingConsentCount: 9,
    auditEventsToday: 34,
  },
  safety: {
    criticalRiskSessions: 0,
    highRiskSessions: 1,
    safetyRulesEnabled: 42,
    blockedFromNormalCoaching: 1,
  },
};

type UserAdminRecord = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: "active" | "suspended" | "pending";
  familyId?: string;
  lastActiveAt: string;
  createdAt: string;
  mfaEnabled: boolean;
  consentCount: number;
};

type FamilyAdminRecord = {
  id: string;
  displayName: string;
  ownerEmail: string;
  memberCount: number;
  childCount: number;
  sessionCount: number;
  consentStatus: "all_granted" | "partial" | "none";
  therapistAssigned: boolean;
  therapistId?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  lastSessionAt: string;
  createdAt: string;
  audioStoredCount: number;
};

type TherapistAdminRecord = {
  id: string;
  email: string;
  displayName: string;
  role: "therapist" | "psychologist" | "school_counselor";
  status: "active" | "inactive";
  assignedFamilyCount: number;
  activeCaseCount: number;
  pendingReviewCount: number;
  lastActivityAt: string;
  createdAt: string;
  licenseVerified: boolean;
  consentScopeOnly: boolean;
};

const adminUsersDemo: UserAdminRecord[] = [
  { id: "user_admin_1", email: "priya@kidspeak.in", displayName: "Priya Sharma", role: "clinical_admin", status: "active", lastActiveAt: "2026-05-21 09:12", createdAt: "2025-12-01", mfaEnabled: true, consentCount: 0 },
  { id: "user_parent_rao", email: "rao@example.in", displayName: "Vikram Rao", role: "parent", status: "active", familyId: "family-demo-1", lastActiveAt: "2026-05-20 18:40", createdAt: "2026-01-15", mfaEnabled: false, consentCount: 4 },
  { id: "user_parent_meena", email: "meena@example.in", displayName: "Meena Iyer", role: "parent", status: "active", familyId: "family-demo-2", lastActiveAt: "2026-05-19 10:05", createdAt: "2026-02-03", mfaEnabled: false, consentCount: 3 },
  { id: "user_therapist_1", email: "dr.arjun@clinic.in", displayName: "Dr. Arjun Pillai", role: "therapist", status: "active", lastActiveAt: "2026-05-21 11:30", createdAt: "2026-01-10", mfaEnabled: true, consentCount: 0 },
  { id: "user_auditor_1", email: "audit@kidspeak.in", displayName: "Compliance Auditor", role: "auditor", status: "active", lastActiveAt: "2026-05-18 14:00", createdAt: "2026-03-01", mfaEnabled: true, consentCount: 0 },
  { id: "user_support_1", email: "support@kidspeak.in", displayName: "Support Staff", role: "support_staff", status: "active", lastActiveAt: "2026-05-20 09:00", createdAt: "2026-01-20", mfaEnabled: false, consentCount: 0 },
];

const adminFamiliesDemo: FamilyAdminRecord[] = [
  { id: "family-demo-1", displayName: "Rao Family", ownerEmail: "rao@example.in", memberCount: 3, childCount: 2, sessionCount: 8, consentStatus: "all_granted", therapistAssigned: true, therapistId: "user_therapist_1", riskLevel: "low", lastSessionAt: "2026-05-20 18:40", createdAt: "2026-01-15", audioStoredCount: 0 },
  { id: "family-demo-2", displayName: "Iyer Family", ownerEmail: "meena@example.in", memberCount: 2, childCount: 1, sessionCount: 4, consentStatus: "partial", therapistAssigned: false, riskLevel: "medium", lastSessionAt: "2026-05-19 10:05", createdAt: "2026-02-03", audioStoredCount: 0 },
  { id: "family-demo-3", displayName: "Sharma Family", ownerEmail: "sharma@example.in", memberCount: 4, childCount: 2, sessionCount: 2, consentStatus: "none", therapistAssigned: false, riskLevel: "low", lastSessionAt: "2026-05-10 15:00", createdAt: "2026-03-15", audioStoredCount: 0 },
];

const adminTherapistsDemo: TherapistAdminRecord[] = [
  { id: "user_therapist_1", email: "dr.arjun@clinic.in", displayName: "Dr. Arjun Pillai", role: "therapist", status: "active", assignedFamilyCount: 3, activeCaseCount: 2, pendingReviewCount: 1, lastActivityAt: "2026-05-21 11:30", createdAt: "2026-01-10", licenseVerified: true, consentScopeOnly: true },
  { id: "user_therapist_2", email: "dr.kavitha@clinic.in", displayName: "Dr. Kavitha Nair", role: "psychologist", status: "active", assignedFamilyCount: 5, activeCaseCount: 4, pendingReviewCount: 2, lastActivityAt: "2026-05-20 16:00", createdAt: "2026-01-12", licenseVerified: true, consentScopeOnly: true },
  { id: "user_counselor_1", email: "counselor@school.in", displayName: "School Counselor Rajan", role: "school_counselor", status: "active", assignedFamilyCount: 8, activeCaseCount: 6, pendingReviewCount: 0, lastActivityAt: "2026-05-19 09:00", createdAt: "2026-02-01", licenseVerified: false, consentScopeOnly: true },
];

const liveTranscriptPreview = [
  { speaker: "Parent", text: "Please start with the first question." },
  { speaker: "Child", text: "I do not know how to start." },
  { speaker: "Unknown", text: "Short overlap or unclear speaker segment." },
];

const sessionAudioUiMap: Record<string, {
  inputMode: "live_audio" | "uploaded_audio_transient" | "transcript_upload" | "manual_text";
  audioStored: boolean;
  transcript: string[];
  analysis: string[];
}> = {
  "session-001": {
    inputMode: "transcript_upload",
    audioStored: false,
    transcript: [
      "Parent: Why did you not finish homework?",
      "Child: I felt stuck and did not know where to start.",
      "Parent: Let us do one question together.",
    ],
    analysis: ["Correction before connection", "Repair attempt appeared later", "Validation improved re-engagement"],
  },
  "session-002": {
    inputMode: "uploaded_audio_transient",
    audioStored: false,
    transcript: [
      "Parent: We need to begin now.",
      "Child: I am frustrated and need help starting.",
      "Parent: We will do the first step together.",
    ],
    analysis: ["Uploaded audio was transcribed once", "Audio deleted after processing", "Transcript-only review remains available"],
  },
  "session-003": {
    inputMode: "live_audio",
    audioStored: false,
    transcript: [
      "Parent: We are ending screen time now.",
      "Child: I need one more minute.",
      "Parent: I hear that. We are still stopping now.",
    ],
    analysis: ["Live audio-to-text only", "No raw audio retained", "Boundary remained calmer after validation"],
  },
};

const noAudioComplianceRows = [
  { sessionId: "session-001", audioStored: false, note: "Compliant: transcript-only session." },
  { sessionId: "session-002", audioStored: false, note: "Compliant: uploaded audio discarded after transcription." },
  { sessionId: "session-legacy-a", audioStored: true, note: "Flagged: legacy session requires admin review." },
];

type AuditEventType =
  | "user_login"
  | "consent_accepted"
  | "consent_revoked"
  | "session_created"
  | "audio_received"
  | "transcription_started"
  | "transcription_completed"
  | "audio_discarded"
  | "transcript_saved"
  | "analysis_run"
  | "therapist_viewed_session"
  | "therapist_added_note"
  | "data_export_requested"
  | "data_deleted"
  | "safety_rule_triggered"
  | "break_glass_access_used"
  | "feature_flag_changed"
  | "prompt_approved"
  | "language_config_changed";

type AuditSeverity = "low" | "medium" | "high";

type AdminAuditLogRecord = {
  eventId: string;
  eventType: AuditEventType;
  actorUserId: string;
  actorRole: AppRole;
  familyId?: string;
  childId?: string;
  sessionId?: string;
  timestamp: string;
  ipHash: string;
  userAgentHash: string;
  metadata: string;
  severity: AuditSeverity;
};

const adminAuditLogEvents: AdminAuditLogRecord[] = [
  {
    eventId: "audit-001",
    eventType: "user_login",
    actorUserId: "user_super_admin_1",
    actorRole: "super_admin",
    timestamp: "2026-05-19 07:55",
    ipHash: "iphash_001aa",
    userAgentHash: "uahash_001aa",
    metadata: "Admin login for morning governance review.",
    severity: "low",
  },
  {
    eventId: "audit-002",
    eventType: "consent_accepted",
    actorUserId: "user_parent_rao",
    actorRole: "parent",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    timestamp: "2026-05-19 08:00",
    ipHash: "iphash_rao01",
    userAgentHash: "uahash_rao01",
    metadata: "Accepted recording_and_transcription v3.",
    severity: "medium",
  },
  {
    eventId: "audit-003",
    eventType: "session_created",
    actorUserId: "user_parent_rao",
    actorRole: "parent",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:03",
    ipHash: "iphash_rao01",
    userAgentHash: "uahash_rao01",
    metadata: "Live audio-to-text session started with transcript-only retention.",
    severity: "medium",
  },
  {
    eventId: "audit-004",
    eventType: "audio_received",
    actorUserId: "user_parent_rao",
    actorRole: "parent",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:04",
    ipHash: "iphash_rao01",
    userAgentHash: "uahash_rao01",
    metadata: "Live audio chunk received for one-time transcription only.",
    severity: "medium",
  },
  {
    eventId: "audit-005",
    eventType: "transcription_started",
    actorUserId: "system_transcription",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:04",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "Speech-to-text job started with STORE_RAW_AUDIO=false.",
    severity: "medium",
  },
  {
    eventId: "audit-006",
    eventType: "transcription_completed",
    actorUserId: "system_transcription",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:05",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "Transcript created successfully.",
    severity: "medium",
  },
  {
    eventId: "audit-007",
    eventType: "audio_discarded",
    actorUserId: "system_transcription",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:05",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "Temporary audio removed after transcription completed.",
    severity: "high",
  },
  {
    eventId: "audit-008",
    eventType: "transcript_saved",
    actorUserId: "system_transcription",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:05",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "Transcript turns and analysis saved; audio path remains null.",
    severity: "medium",
  },
  {
    eventId: "audit-009",
    eventType: "analysis_run",
    actorUserId: "system_analysis",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-003",
    timestamp: "2026-05-19 08:06",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "Rule-based analysis completed.",
    severity: "medium",
  },
  {
    eventId: "audit-010",
    eventType: "therapist_viewed_session",
    actorUserId: "user_therapist_1",
    actorRole: "therapist",
    familyId: "family-demo-2",
    childId: "child-demo-mira",
    sessionId: "session-003",
    timestamp: "2026-05-19 09:10",
    ipHash: "iphash_ther01",
    userAgentHash: "uahash_ther01",
    metadata: "Viewed high-risk session in assigned case workspace.",
    severity: "high",
  },
  {
    eventId: "audit-011",
    eventType: "therapist_added_note",
    actorUserId: "user_therapist_1",
    actorRole: "therapist",
    familyId: "family-demo-2",
    childId: "child-demo-mira",
    sessionId: "session-003",
    timestamp: "2026-05-19 09:16",
    ipHash: "iphash_ther01",
    userAgentHash: "uahash_ther01",
    metadata: "Added professional observation and follow-up note.",
    severity: "medium",
  },
  {
    eventId: "audit-012",
    eventType: "data_export_requested",
    actorUserId: "user_parent_rao",
    actorRole: "parent",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    timestamp: "2026-05-19 10:01",
    ipHash: "iphash_rao01",
    userAgentHash: "uahash_rao01",
    metadata: "Requested consent and transcript export bundle.",
    severity: "medium",
  },
  {
    eventId: "audit-013",
    eventType: "data_deleted",
    actorUserId: "user_super_admin_1",
    actorRole: "super_admin",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    sessionId: "session-legacy-a",
    timestamp: "2026-05-19 11:20",
    ipHash: "iphash_001aa",
    userAgentHash: "uahash_001aa",
    metadata: "Deleted transcript after parent request completion.",
    severity: "high",
  },
  {
    eventId: "audit-014",
    eventType: "safety_rule_triggered",
    actorUserId: "system_safety",
    actorRole: "super_admin",
    familyId: "family-demo-2",
    childId: "child-demo-mira",
    sessionId: "session-003",
    timestamp: "2026-05-19 11:42",
    ipHash: "iphash_system",
    userAgentHash: "uahash_system",
    metadata: "abuse_disclosure rule triggered and normal coaching blocked.",
    severity: "high",
  },
  {
    eventId: "audit-015",
    eventType: "break_glass_access_used",
    actorUserId: "user_super_admin_1",
    actorRole: "super_admin",
    familyId: "family-demo-2",
    childId: "child-demo-mira",
    sessionId: "session-003",
    timestamp: "2026-05-19 12:03",
    ipHash: "iphash_001aa",
    userAgentHash: "uahash_001aa",
    metadata: "Urgent risk review with documented reason and expiry.",
    severity: "high",
  },
  {
    eventId: "audit-016",
    eventType: "feature_flag_changed",
    actorUserId: "user_super_admin_1",
    actorRole: "super_admin",
    timestamp: "2026-05-19 13:00",
    ipHash: "iphash_001aa",
    userAgentHash: "uahash_001aa",
    metadata: "Confirmed STORE_RAW_AUDIO remains false and locked.",
    severity: "high",
  },
  {
    eventId: "audit-017",
    eventType: "prompt_approved",
    actorUserId: "user_clinical_admin_1",
    actorRole: "clinical_admin",
    timestamp: "2026-05-19 14:00",
    ipHash: "iphash_clin01",
    userAgentHash: "uahash_clin01",
    metadata: "Approved risk_review prompt v8.",
    severity: "medium",
  },
  {
    eventId: "audit-018",
    eventType: "language_config_changed",
    actorUserId: "user_super_admin_1",
    actorRole: "super_admin",
    timestamp: "2026-05-19 14:20",
    ipHash: "iphash_001aa",
    userAgentHash: "uahash_001aa",
    metadata: "Updated Hindi child-friendly review state.",
    severity: "medium",
  },
  {
    eventId: "audit-019",
    eventType: "consent_revoked",
    actorUserId: "user_parent_rao",
    actorRole: "parent",
    familyId: "family-demo-1",
    childId: "child-demo-aarav",
    timestamp: "2026-05-19 15:05",
    ipHash: "iphash_rao01",
    userAgentHash: "uahash_rao01",
    metadata: "Revoked therapist_sharing consent.",
    severity: "high",
  },
];

function LoginScreen({ onLogin, onGoSignup }: { onLogin: (s: AuthSession) => void; onGoSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Email and password are required."); return; }
    setSubmitting(true); setError(null);
    try {
      const session = await apiJson<AuthSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>KidSpeak</h1>
          <p>Family response intelligence</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h2>Sign in</h2>
          {error ? <div className="warning">{error}</div> : null}
          <label>Email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </label>
          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="auth-footer">
          <span>No account?</span>
          <button type="button" className="auth-link-btn" onClick={onGoSignup}>Create one</button>
        </div>
        <div className="auth-demo-hint">
          <p>Demo accounts — sign up with any email and choose a role to explore.</p>
        </div>
      </div>
    </div>
  );
}

function SignupScreen({ onLogin, onGoLogin }: { onLogin: (s: AuthSession) => void; onGoLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("parent");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) { setError("All fields are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSubmitting(true); setError(null);
    try {
      const session = await apiJson<AuthSession>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, displayName: displayName.trim(), role }),
      });
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed. Try a different email.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>KidSpeak</h1>
          <p>Family response intelligence</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h2>Create account</h2>
          {error ? <div className="warning">{error}</div> : null}
          <label>Full name
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" autoComplete="name" autoFocus required />
          </label>
          <label>Email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" required />
          </label>
          <label>Confirm password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" required />
          </label>
          <label>I am a…
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <option value="parent">Parent / guardian</option>
              <option value="therapist">Therapist</option>
              <option value="psychologist">Psychologist</option>
              <option value="clinical_admin">Clinical admin</option>
              <option value="support_staff">Support staff</option>
              <option value="auditor">Auditor</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>
          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <div className="auth-footer">
          <span>Already have an account?</span>
          <button type="button" className="auth-link-btn" onClick={onGoLogin}>Sign in</button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => loadAuthSession());
  const role: AppRole = authSession?.role ?? "parent";

  function onLogin(session: AuthSession) {
    saveAuthSession(session);
    setAuthSession(session);
    window.history.pushState(null, "", "/dashboard");
    setPath("/dashboard");
  }

  function onLogout() {
    if (authSession) {
      apiJson("/api/auth/logout", { method: "POST", body: JSON.stringify({ token: authSession.token }) }).catch(() => {});
    }
    clearAuthSession();
    setAuthSession(null);
    window.history.pushState(null, "", "/login");
    setPath("/login");
  }

  // Show auth screens before the shell
  if (!authSession || path === "/login") {
    return <LoginScreen onLogin={onLogin} onGoSignup={() => { window.history.pushState(null, "", "/signup"); setPath("/signup"); }} />;
  }
  if (path === "/signup") {
    return <SignupScreen onLogin={onLogin} onGoLogin={() => { window.history.pushState(null, "", "/login"); setPath("/login"); }} />;
  }
  const product = productNames.find((name) => name.active) ?? productNames[0];
  const visibleNavGroups = useMemo(() => getVisibleNavGroups(role), [role]);
  const routeAccess = useMemo(() => canAccessRoute(path, role), [path, role]);

  const currentRoute = useMemo(() => {
    const navRoute = findNavItemForPath(path);
    if (navRoute) {
      return {
        label: navRoute.label,
        path,
        purpose: navRoute.purpose,
      };
    }

    if (/^\/sessions\/[^/]+\/parent$/.test(path)) {
      return {
        label: "Parent Coaching",
        path,
        purpose: "Help parents see where their response escalated the issue and how to respond better.",
      };
    }

    if (/^\/sessions\/[^/]+\/child$/.test(path)) {
      return {
        label: "Kid Self-Coaching",
        path,
        purpose: "Help the child understand what happened, what they felt, and what they can try next time.",
      };
    }

    if (/^\/sessions\/[^/]+\/safety$/.test(path)) {
      return {
        label: "Safety Risk",
        path,
        purpose: "Check concerning language and route high-risk content before normal coaching.",
      };
    }

    if (/^\/therapist\/families\/[^/]+$/.test(path)) {
      return {
        label: "Family Summary",
        path,
        purpose: "Show repeated triggers, trends, risk events, and home practice completion for an assigned family.",
      };
    }

    if (/^\/therapist\/sessions\/[^/]+$/.test(path)) {
      return {
        label: "Session Review",
        path,
        purpose: "Review transcript timeline, graph, coaching observations, notes, practice, and export summary.",
      };
    }

    if (/^\/therapist\/admin(?:\/.*)?$/.test(path)) {
      return {
        label: "Therapist Admin",
        path,
        purpose: "Professional governance workspace for assigned families, case review, risk queue, practice, reports, and templates.",
      };
    }

    if (/^\/admin(?:\/.*)?$/.test(path)) {
      return {
        label: "Platform Admin",
        path,
        purpose: "Governance, RBAC, language, prompt, safety, privacy, infrastructure, cost, and audit controls.",
      };
    }

    return {
      label: "Dashboard",
      path: "/dashboard",
      purpose: "Overview for intake, no-raw-audio policy, safety posture, and low-cost MVP controls.",
    };
  }, [path]);

  function navigate(route: RouteDefinition) {
    const nextPath = materializeRoutePath(route.path);
    window.history.pushState(null, "", nextPath);
    setPath(nextPath);
  }

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">Product option</span>
          <h1>{product.name}</h1>
          <p>{product.positioning}</p>
          <div className="auth-user-block">
            <span className="auth-display-name">{authSession.displayName}</span>
            <span className="auth-role-badge">{role}</span>
            <button className="auth-logout-btn" type="button" onClick={onLogout}>Sign out</button>
          </div>
        </div>
        <nav className="nav-list grouped" aria-label="Primary">
          {visibleNavGroups.map((group) => (
            <section className="nav-group" key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((route) => (
                <button
                  className={routeMatchesPath(route.path, path) ? "nav-item active" : "nav-item"}
                  key={route.path}
                  onClick={() => navigate(route)}
                  type="button"
                >
                  {route.label}
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>
      <main className="main-panel">
        <div className="global-banner">Raw audio is not stored. Audio is used only for transcription and then discarded.</div>
        <header className="page-header">
          <div>
            <span className="eyebrow">{currentRoute.path}</span>
            <h2>{currentRoute.label}</h2>
            <p>{currentRoute.purpose}</p>
          </div>
          <div className="status-pill">No medical diagnosis claims</div>
        </header>
        {routeAccess.allowed ? (
          <Screen path={currentRoute.path} role={role} />
        ) : (
          <AccessDeniedScreen role={role} reason={routeAccess.reason} />
        )}
      </main>
    </div>
  );
}

function normalizePath(path: string): string {
  return path === "/" ? "/dashboard" : path;
}

function materializeRoutePath(path: string): string {
  return path.replace("[id]", demoSessionId);
}

function routePattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\[id\\]", "[^/]+");
  return new RegExp(`^${escaped}$`);
}

function routeMatchesPath(routePath: string, currentPath: string): boolean {
  return routePattern(routePath).test(currentPath);
}

function findNavItemForPath(path: string): NavItem | undefined {
  return navGroups.flatMap((group) => group.items).find((item) => routeMatchesPath(item.path, path));
}

function getVisibleNavGroups(role: AppRole): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role) && !(role === "support_staff" && item.sensitive)),
    }))
    .filter((group) => group.items.length > 0);
}

function canAccessRoute(path: string, role: AppRole): { allowed: boolean; reason: string } {
  if (role === "support_staff" && isChildSensitivePath(path)) {
    return {
      allowed: false,
      reason: "Support staff cannot view transcript, child-sensitive, coaching, or therapist case pages.",
    };
  }

  if (path === "/admin/audit-logs") {
    return ["super_admin", "auditor", "therapist", "psychologist", "parent"].includes(role)
      ? { allowed: true, reason: "Audit logs access is scoped by role." }
      : { allowed: false, reason: `The ${role} role is not allowed to open this route.` };
  }

  const navItem = findNavItemForPath(path);
  if (navItem) {
    return navItem.roles.includes(role)
      ? { allowed: true, reason: "Allowed by route role policy." }
      : { allowed: false, reason: `The ${role} role is not allowed to open this route.` };
  }

  if (/^\/therapist\/(?:families|sessions)\/[^/]+$/.test(path)) {
    return therapistRoles.includes(role)
      ? { allowed: true, reason: "Assigned therapist case route." }
      : { allowed: false, reason: "Therapist case routes require therapist, psychologist, clinical admin, or super admin access." };
  }

  if (/^\/sessions\/[^/]+(?:\/.*)?$/.test(path)) {
    return parentRoles.includes(role)
      ? { allowed: true, reason: "Family-scoped parent route." }
      : { allowed: false, reason: "Session routes are restricted to the parent workspace or super admin." };
  }

  if (path === "/dashboard") {
    return { allowed: true, reason: "Dashboard is allowed." };
  }

  return role === "super_admin"
    ? { allowed: true, reason: "Super admin fallback access." }
    : { allowed: false, reason: "This route is not visible for the current role." };
}

function isChildSensitivePath(path: string): boolean {
  return (
    /^\/sessions(?:\/.*)?$/.test(path) ||
    /^\/record$/.test(path) ||
    /^\/upload-audio$/.test(path) ||
    /^\/upload-transcript$/.test(path) ||
    /^\/history(?:\/.*)?$/.test(path) ||
    /^\/therapist(?:\/.*)?$/.test(path) ||
    /^\/settings\/(?:consent|privacy|language|therapist-sharing|export-data|delete-data)$/.test(path)
  );
}

function AccessDeniedScreen({ role, reason }: { role: AppRole; reason: string }) {
  return (
    <section className="grid two">
      <Panel title="Access Restricted">
        <MetricRow label="Logged-in role" value={role} />
        <MetricRow label="Decision" value={reason} />
        <p className="muted">Route guards protect transcripts, child-sensitive coaching pages, therapist cases, platform administration, and break-glass workflows.</p>
      </Panel>
      <Panel title="Governance Rule">
        <ul className="check-list">
          <li>Parent routes are family-scoped.</li>
          <li>Therapists only see consented assigned cases.</li>
          <li>Support staff cannot view transcripts or child-sensitive routes.</li>
          <li>Super admin sensitive access requires a break-glass reason and audit log in production.</li>
        </ul>
      </Panel>
    </section>
  );
}

function Screen({ path, role }: { path: string; role: AppRole }) {
  if (/^\/therapist\/admin\/families(?:\/.*)?$/.test(path)) {
    return <TherapistFamilyAdminScreen path={path} />;
  }

  if (/^\/therapist\/admin\/cases(?:\/.*)?$/.test(path)) {
    return <TherapistCasesAdminScreen />;
  }

  if (/^\/therapist\/admin\/session-review(?:\/.*)?$/.test(path)) {
    return <TherapistSessionReviewAdminScreen path={path} />;
  }

  if (/^\/therapist\/admin\/risk-queue(?:\/.*)?$/.test(path)) {
    return <TherapistRiskQueueScreen />;
  }

  if (/^\/therapist\/admin\/practice-library(?:\/.*)?$/.test(path)) {
    return <TherapistPracticeLibraryScreen />;
  }

  if (/^\/therapist\/admin\/progress-reports(?:\/.*)?$/.test(path)) {
    return <TherapistProgressReportsScreen />;
  }

  if (/^\/therapist\/admin\/notes-templates(?:\/.*)?$/.test(path)) {
    return <TherapistNotesTemplateScreen />;
  }

  if (/^\/sessions\/[^/]+\/parent$/.test(path)) {
    return <ParentSessionCoachingScreen sessionId={path.split("/")[2]} />;
  }

  if (/^\/sessions\/[^/]+\/child$/.test(path)) {
    return <ChildSessionCoachingScreen sessionId={path.split("/")[2]} />;
  }

  if (/^\/sessions\/[^/]+\/graph$/.test(path)) {
    return <ConversationGraphScreen sessionId={path.split("/")[2]} />;
  }

  if (/^\/sessions\/[^/]+$/.test(path)) {
    return <SessionDetailScreen sessionId={path.split("/")[2]} />;
  }

  if (/^\/sessions\/[^/]+\/safety$/.test(path)) {
    return <SafetyRiskScreen sessionId={path.split("/")[2]} />;
  }

  if (/^\/therapist\/families\/[^/]+$/.test(path)) {
    return <TherapistFamilySummaryScreen familyId={path.split("/")[3]} />;
  }

  if (/^\/therapist\/sessions\/[^/]+$/.test(path)) {
    return <TherapistSessionReviewScreen sessionId={path.split("/")[3]} />;
  }

  if (/^\/therapist\/admin(?:\/.*)?$/.test(path)) {
    return <TherapistAdminScreen path={path} />;
  }

  if (/^\/admin(?:\/.*)?$/.test(path) && path !== "/admin/cost") {
    return <PlatformAdminScreen path={path} role={role} />;
  }

  switch (path) {
    case "/dashboard":
      return <DashboardScreen />;
    case "/record":
      return <RecordScreen />;
    case "/upload-audio":
      return <UploadAudioScreen />;
    case "/upload-transcript":
      return <UploadTranscriptScreen />;
    case "/sessions":
      return <SessionsScreen />;
    case "/settings/therapist-sharing":
      return <TherapistSharingSettingsScreen />;
    case "/settings/delete-data":
      return <DeleteDataSettingsScreen />;
    case "/settings/export-data":
      return <ExportDataSettingsScreen />;
    case "/history":
      return <HistoryScreen />;
    case "/history/trends":
      return <TrendsScreen />;
    case "/conversation-graph":
      return <ConversationGraphScreen />;
    case "/parent-coaching":
      return <ParentCoachingScreen />;
    case "/kid-self-coaching":
      return <KidSelfCoachingScreen />;
    case "/therapist":
    case "/therapist-dashboard":
      return <TherapistDashboardScreen />;
    case "/settings/language":
      return <LocalisationScreen />;
    case "/settings/privacy":
      return <PrivacyScreen />;
    case "/settings/consent":
      return <ConsentSettingsScreen />;
    case "/settings/data-retention":
      return <DataRetentionScreen />;
    case "/moat":
      return <MoatScreen />;
    case "/live-coach":
      return <LiveCoachScreen />;
    case "/safety-consent":
      return <SafetyConsentScreen />;
    case "/cost-admin":
      return <CostAdminScreen />;
    case "/admin/cost":
      return <AdminCostScreen role={role} />;
    default:
      return <DashboardScreen />;
  }
}

function loadFamilyProfile(): { familyName: string; children: string[]; defaultSituation: string; contextNote: string } {
  try {
    const raw = localStorage.getItem("family_profile");
    if (raw) return JSON.parse(raw) as { familyName: string; children: string[]; defaultSituation: string; contextNote: string };
  } catch {}
  return { familyName: "", children: ["", ""], defaultSituation: "homework_conflict", contextNote: "" };
}

function DashboardScreen() {
  const [profile, setProfile] = useState(loadFamilyProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateChild = (index: number, value: string) => {
    setProfile((prev) => {
      const updated = [...prev.children];
      updated[index] = value;
      return { ...prev, children: updated };
    });
    setSaved(false);
  };

  const addChild = () => setProfile((prev) => ({ ...prev, children: [...prev.children, ""] }));

  const removeChild = (index: number) => setProfile((prev) => ({ ...prev, children: prev.children.filter((_, i) => i !== index) }));

  const saveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const payload = {
        familyId: "family-demo-1",
        familyName: profile.familyName || "My Family",
        children: profile.children.filter(Boolean),
        defaultSituation: profile.defaultSituation,
        contextNote: profile.contextNote,
      };
      await apiJson("/api/family-profile", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      localStorage.setItem("family_profile", JSON.stringify(profile));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save family profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="stack">
      <section className="grid two">
        <Panel title="Family Setup">
          {saved ? <div className="success-banner">Family profile saved.</div> : null}
          {saveError ? <div className="warning">{saveError}</div> : null}
          <div className="form-grid">
            <label>Family name
              <input type="text" value={profile.familyName} onChange={(e) => { setProfile((p) => ({ ...p, familyName: e.target.value })); setSaved(false); }} placeholder="e.g. Sharma Family" />
            </label>
            <label>Default situation
              <select value={profile.defaultSituation} onChange={(e) => { setProfile((p) => ({ ...p, defaultSituation: e.target.value })); setSaved(false); }}>
                {situationOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Family context note
              <textarea value={profile.contextNote} onChange={(e) => { setProfile((p) => ({ ...p, contextNote: e.target.value })); setSaved(false); }} placeholder="Optional: describe family background, recurring challenges, therapist guidance." rows={3} />
            </label>
          </div>
          <div className="form-grid" style={{ marginTop: "12px" }}>
            <strong>Children</strong>
            {profile.children.map((child, index) => (
              <div key={index} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="text" value={child} onChange={(e) => updateChild(index, e.target.value)} placeholder={`Child ${index + 1} name`} style={{ flex: 1 }} />
                {profile.children.length > 1
                  ? <button type="button" onClick={() => removeChild(index)} style={{ padding: "4px 8px", cursor: "pointer" }}>✕</button>
                  : null}
              </div>
            ))}
            <button type="button" className="secondary-action" onClick={addChild}>+ Add child</button>
          </div>
          <button className="primary-action" type="button" onClick={saveProfile} disabled={saving} style={{ marginTop: "16px" }}>
            {saving ? "Saving…" : "Save family profile"}
          </button>
        </Panel>
        <Panel title="Intake Options">
          <ul className="check-list">
            <li>Record a guided 2-5 minute consented session inside the app.</li>
            <li>Upload an existing mobile phone voice recording.</li>
            <li>Paste or upload a transcript and skip transcription cost.</li>
            <li>Rule-based analysis runs first — AI only on explicit request.</li>
          </ul>
          <div style={{ marginTop: "12px" }}>
            <MetricRow label="Audio max duration" value="5 minutes default" />
            <MetricRow label="Raw audio storage" value="Disabled (STORE_RAW_AUDIO=false)" />
            <MetricRow label="AI speaker inference" value="Off by default" />
            <MetricRow label="AI on page load" value="No" />
          </div>
        </Panel>
      </section>
      <IntakeCards />
    </section>
  );
}

function parseTranscriptLines(raw: string): Array<{ speaker: string; text: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const speaker = line.slice(0, colonIndex).trim();
        const text = line.slice(colonIndex + 1).trim();
        return { speaker, text };
      }
      return { speaker: "Unknown", text: line };
    });
}

function RecordScreen() {
  const childOptions = getChildOptions();
  const [selectedChildId, setSelectedChildId] = useState(() => getChildOptions()[0]?.id ?? "child_demo_1");
  const [selectedSituation, setSelectedSituation] = useState<typeof situationOptions[number]["id"]>(() => getDefaultSituation() as typeof situationOptions[number]["id"]);
  const [conversationLanguage, setConversationLanguage] = useState<SupportedLanguage>("en-IN");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionNote, setSessionNote] = useState("");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [analysisQueued, setAnalysisQueued] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(null);
  const parsedLines = parseTranscriptLines(transcriptInput);
  const hasTranscriptPreview = parsedLines.length > 0;

  const persistRecordedSession = async () => {
    if (!hasTranscriptPreview) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setAnalysisQueued(true);

    try {
      const session = await apiJson<ConversationSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          childId: selectedChildId,
          createdByUserId: "parent_demo_1",
          situationType: selectedSituation,
          language: conversationLanguage,
          durationSeconds: parsedLines.length * 10,
          inputMode: "live_audio",
          audioStoragePath: null,
          transcriptStatus: "uploaded",
          riskLevel: "low",
          overallPattern: sessionNote || "Live recorded conversation ready for analysis",
        }),
      });

      await apiJson(`/api/sessions/${session.id}/turns`, {
        method: "POST",
        body: JSON.stringify({
          turns: parsedLines.map((line, index) => ({
            id: `live_turn_${index + 1}`,
            speaker: line.speaker.toLowerCase() === "parent" ? "parent" : line.speaker.toLowerCase() === "child" ? "child" : "unknown",
            startTimeSec: index * 10,
            endTimeSec: index * 10 + 8,
            text: line.text,
            originalText: line.text,
            originalLanguage: conversationLanguage,
            emotionLabel: "",
            toneLabel: "",
            intentLabel: "",
            conversationAct: "transcript_turn",
            escalationScore: 0,
            repairOpportunity: "",
            suggestedReframe: "",
          })),
        }),
      });

      const bundle = await runFullAnalysisForSession(session, conversationLanguage, "hi-IN");
      setRuntimeBundle(bundle);
      setIsRecording(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not save recorded session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="stack">
      <IntakeCards active="record" />
      <Panel title="Record Now">
        <div className="form-grid">
          <label>Child<select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>{childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
          <label>Situation<select value={selectedSituation} onChange={(event) => setSelectedSituation(event.target.value as typeof situationOptions[number]["id"])}>{situationOptions.map((situation) => <option key={situation.id} value={situation.id}>{situation.label}</option>)}</select></label>
          <label>Conversation language<select value={conversationLanguage} onChange={(event) => setConversationLanguage(event.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
          <p className="muted">The selected language is stored on the ConversationSession and sent as `languageCode` to the transcription provider.</p>
          <div className="global-banner">This session uses live audio-to-text. Raw audio is not stored.</div>
          {submitError ? <div className="warning">{submitError}</div> : null}
          <div className="warning">Consent reminder: everyone being recorded should know the recording is happening and why.</div>
          <div className="recorder-surface">
            <strong>2-5 minute guided conversation</strong>
            <span>Start recording, then type or paste the conversation below. Each line should start with <code>Parent:</code> or <code>Child:</code> followed by what was said.</span>
            <div className="action-row">
              <button type="button" className={isRecording ? "secondary-action" : ""} onClick={() => {
                setIsRecording(true);
                setAnalysisQueued(false);
              }}>
                {isRecording ? "Recording in progress" : "Start Recording"}
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={!isRecording}
                onClick={() => {
                  setIsRecording(false);
                  setTranscriptInput("");
                  setAnalysisQueued(false);
                }}
              >
                Stop and discard
              </button>
            </div>
          </div>
          {isRecording && (
            <label>
              Transcript (type as the conversation happens, one line per turn)
              <textarea
                className="large-input"
                placeholder={"Parent: Why did you not finish homework?\nChild: I felt stuck and did not know where to start.\nParent: Let us do one question together."}
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                rows={8}
              />
              <small className="muted">Format: <code>Parent: text</code> or <code>Child: text</code> — one turn per line</small>
            </label>
          )}
          {!isRecording && transcriptInput && (
            <label>
              Recorded transcript (edit before submitting)
              <textarea
                className="large-input"
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                rows={8}
              />
            </label>
          )}
          <section className="grid two">
            <Panel title="Transcript Preview">
              {parsedLines.length === 0 ? (
                <p className="muted">Start recording and type the conversation turns above.</p>
              ) : (
                <div className="timeline">
                  {parsedLines.map((line, i) => (
                    <article key={i}>
                      <strong>{line.speaker}</strong>
                      <p>{line.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Session Status">
              <MetricRow label="Recording state" value={isRecording ? "Recording" : "Stopped"} />
              <MetricRow label="Turns captured" value={String(parsedLines.length)} />
              <MetricRow label="Parent turns" value={String(parsedLines.filter((l) => l.speaker.toLowerCase() === "parent").length)} />
              <MetricRow label="Child turns" value={String(parsedLines.filter((l) => l.speaker.toLowerCase() === "child").length)} />
              <MetricRow
                label="Analysis state"
                value={analysisQueued ? "Ready to generate coaching" : hasTranscriptPreview ? "Ready when you finish" : "Waiting for transcript"}
              />
              <p className="muted">Raw audio is not stored. Only transcript turns are saved.</p>
            </Panel>
          </section>
          <label>Session note<textarea value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} placeholder="Add situation context. Do not add diagnosis labels." /></label>
          <div className="action-row">
              <button
              className="secondary-action"
              type="button"
              disabled={!hasTranscriptPreview || isSubmitting}
              onClick={() => void persistRecordedSession()}
            >
              {isSubmitting ? "Saving and analyzing..." : "Finish and analyze session"}
            </button>
            <span className="muted">
              {hasTranscriptPreview
                ? "Save transcript turns and continue to coaching analysis."
                : "Start recording to create transcript turns for analysis."}
            </span>
          </div>
        </div>
      </Panel>
      {runtimeBundle ? (
        <Panel title="Recorded Session Results">
          <div className="action-row">
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}`}>Session detail</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/graph`}>Conversation graph</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/parent`}>Parent coaching</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/child`}>Child coaching</a>
          </div>
        </Panel>
      ) : null}
    </section>
  );
}

function UploadAudioScreen() {
  const childOptions = getChildOptions();
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeLabel: string; sizeBytes: number; type: string } | null>(null);
  const [selectedChildId, setSelectedChildId] = useState(() => getChildOptions()[0]?.id ?? "child_demo_1");
  const [selectedSituation, setSelectedSituation] = useState<typeof situationOptions[number]["id"]>(() => getDefaultSituation() as typeof situationOptions[number]["id"]);
  const [conversationLanguage, setConversationLanguage] = useState<SupportedLanguage>("en-IN");
  const [uploadRequested, setUploadRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(null);

  const normalizeAudioMimeType = (type: string): "audio/webm" | "audio/wav" | "audio/mp3" | "audio/mpeg" | "audio/mp4" | "audio/m4a" => {
    if (type === "audio/webm" || type === "audio/wav" || type === "audio/mp3" || type === "audio/mpeg" || type === "audio/mp4" || type === "audio/m4a") {
      return type;
    }
    return "audio/mp4";
  };

  const uploadAndTranscribe = async () => {
    if (!fileMeta) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setUploadRequested(true);

    try {
      const session = await apiJson<ConversationSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          childId: selectedChildId,
          createdByUserId: "parent_demo_1",
          situationType: selectedSituation,
          language: conversationLanguage,
          durationSeconds: 120,
          inputMode: "uploaded_audio_transient",
          audioStoragePath: null,
          transcriptStatus: "uploaded",
          riskLevel: "low",
          overallPattern: "Audio uploaded for one-time transcription",
        }),
      });

      await apiJson(`/api/sessions/${session.id}/audio/upload`, {
        method: "POST",
        body: JSON.stringify({
          fileName: fileMeta.name,
          mimeType: normalizeAudioMimeType(fileMeta.type),
          fileSizeBytes: fileMeta.sizeBytes,
          estimatedDurationSeconds: 120,
        }),
      });

      await apiJson(`/api/sessions/${session.id}/audio/mock-transcribe`, {
        method: "POST",
        body: JSON.stringify({
          languageCode: conversationLanguage,
        }),
      });

      const bundle = await runFullAnalysisForSession(session, conversationLanguage, "hi-IN");
      setRuntimeBundle(bundle);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not upload audio.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="stack">
      <IntakeCards active="audio" />
      <section className="grid two">
        <Panel title="Upload Audio for One-Time Transcription">
          <div className="form-grid">
            <div className="global-banner">The uploaded file will be used only to create a transcript and then deleted.</div>
            <label>Child<select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>{childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
            <label>Situation<select value={selectedSituation} onChange={(event) => setSelectedSituation(event.target.value as typeof situationOptions[number]["id"])}>{situationOptions.map((situation) => <option key={situation.id} value={situation.id}>{situation.label}</option>)}</select></label>
            <label>Conversation language<select value={conversationLanguage} onChange={(event) => setConversationLanguage(event.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
            <label>Phone recorder file<input type="file" accept={supportedAudioFormats} onChange={(event) => {
              const file = event.target.files?.[0];
              setUploadRequested(false);
              setSubmitError(null);
              setFileMeta(file ? { name: file.name, sizeLabel: formatBytes(file.size), sizeBytes: file.size, type: file.type || "audio/mp4" } : null);
            }} /></label>
            <div className="drop-zone">Supported formats: webm, wav, mp3, mpeg, mp4, m4a</div>
            {submitError ? <div className="warning">{submitError}</div> : null}
            <div className="action-row">
              <button
                className="secondary-action"
                type="button"
                disabled={!fileMeta || isSubmitting}
                onClick={() => void uploadAndTranscribe()}
              >
                {isSubmitting ? "Uploading and transcribing..." : "Upload and transcribe"}
              </button>
              <span className="muted">
                {fileMeta
                  ? "Create transcript turns, then continue to analysis."
                  : "Choose an audio file to enable transcription."}
              </span>
            </div>
            <p className="muted">Audio max duration defaults to 5 minutes. File size is configurable by deployment.</p>
          </div>
        </Panel>
        <Panel title="Validation & Storage">
          <MetricRow label="Selected file" value={fileMeta?.name ?? "None"} />
          <MetricRow label="File size" value={fileMeta?.sizeLabel ?? "Waiting"} />
          <MetricRow label="MIME type" value={fileMeta?.type ?? "Waiting"} />
          <MetricRow label="Estimated duration" value="Validated by API metadata" />
          <MetricRow label="Upload state" value={!fileMeta ? "Waiting for file" : uploadRequested ? "Ready to transcribe" : "Ready for upload"} />
          <MetricRow label="AudioProcessingEvent" value="Stored without audio path" />
          <MetricRow label="audioPersisted" value="false" />
          <p className="muted">Audio deleted. Transcript saved.</p>
          {audioUploads.map((upload) => (
            <MetricRow key={upload.id} label={upload.fileName} value={`${upload.transcriptionStatus}, transient processing`} />
          ))}
        </Panel>
      </section>
      {runtimeBundle ? (
        <Panel title="Uploaded Audio Results">
          <div className="action-row">
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}`}>Session detail</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/graph`}>Conversation graph</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/parent`}>Parent coaching</a>
            <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/child`}>Child coaching</a>
          </div>
        </Panel>
      ) : null}
    </section>
  );
}

function UploadTranscriptScreen() {
  const childOptions = getChildOptions();
  const sampleTranscript = "Parent: Why did you not finish homework?\nChild: I don't want to do it.";
  const [selectedChildId, setSelectedChildId] = useState(() => getChildOptions()[0]?.id ?? "child_demo_1");
  const [selectedSituation, setSelectedSituation] = useState<typeof situationOptions[number]["id"]>(() => getDefaultSituation() as typeof situationOptions[number]["id"]);
  const [transcriptLanguage, setTranscriptLanguage] = useState<SupportedLanguage>("en-IN");
  const [recommendationLanguage, setRecommendationLanguage] = useState<SupportedLanguage>("hi-IN");
  const [transcriptText, setTranscriptText] = useState(sampleTranscript);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(null);
  const transcriptLineCount = transcriptText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  const hasTranscript = transcriptText.trim().length > 0;

  const handleTranscriptChange = (value: string) => {
    setTranscriptText(value);
    setAnalysisRequested(false);
    setSubmitError(null);
  };

  const handleAnalyzeTranscript = async () => {
    if (!hasTranscript) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setAnalysisRequested(true);

    try {
      const session = await apiJson<ConversationSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          childId: selectedChildId,
          createdByUserId: "parent_demo_1",
          situationType: selectedSituation,
          language: transcriptLanguage,
          durationSeconds: 0,
          inputMode: "transcript_upload",
          audioStoragePath: null,
          transcriptStatus: "uploaded",
          riskLevel: "low",
          overallPattern: "Transcript uploaded and waiting for analysis",
        }),
      });

      const upload = await apiJson<{
        turns: ConversationTurn[];
        speakerTagsDetected: boolean;
      }>(`/api/sessions/${session.id}/transcript/upload`, {
        method: "POST",
        body: JSON.stringify({
          transcriptLanguage,
          sourceType: "manual_paste",
          rawText: transcriptText,
        }),
      });

      const graph = await apiJson<GraphAnalysisResponse>(`/api/sessions/${session.id}/analysis/run`, {
        method: "POST",
        body: JSON.stringify({
          languageCode: transcriptLanguage,
          coachingLanguage: recommendationLanguage,
        }),
      });

      const [parentAnalysis, childAnalysis, riskAssessment] = await Promise.all([
        apiJson<ParentAnalysisResponse>(`/api/sessions/${session.id}/parent-analysis`),
        apiJson<ChildAnalysisResponse>(`/api/sessions/${session.id}/child-analysis`),
        apiJson<RiskAssessmentResponse>(`/api/sessions/${session.id}/risk-assessment`, {
          method: "POST",
          body: JSON.stringify({ geminiSafetyAnalysisEnabled: false }),
        }),
      ]);

      const bundle: RuntimeSessionBundle = {
        session,
        turns: upload.turns,
        speakerTagsDetected: upload.speakerTagsDetected,
        graph,
        parentAnalysis,
        childAnalysis,
        riskAssessment,
      };

      saveRuntimeSession(bundle);
      setRuntimeBundle(bundle);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Transcript analysis failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="stack">
      <IntakeCards active="transcript" />
      <section className="grid two">
        <Panel title="Paste / Upload Transcript">
          <div className="form-grid">
            <label>Child<select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>{childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
            <label>Situation<select value={selectedSituation} onChange={(event) => setSelectedSituation(event.target.value as typeof situationOptions[number]["id"])}>{situationOptions.map((situation) => <option key={situation.id} value={situation.id}>{situation.label}</option>)}</select></label>
            <label>Transcript language<select value={transcriptLanguage} onChange={(event) => setTranscriptLanguage(event.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
            <label>Recommendation language<select value={recommendationLanguage} onChange={(event) => setRecommendationLanguage(event.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
            <textarea
              className="large-input"
              placeholder="Paste transcript from Google Recorder, Samsung Recorder, iPhone transcription, WhatsApp, or manual notes."
              value={transcriptText}
              onChange={(event) => handleTranscriptChange(event.target.value)}
            />
            <label>Upload transcript file (.txt)
              <input
                type="file"
                accept=".txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const text = ev.target?.result;
                    if (typeof text === "string" && text.trim()) {
                      handleTranscriptChange(text);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <small className="muted">Accepts plain text files. Each line should be <code>Parent: text</code> or <code>Child: text</code></small>
            </label>
            <div className="action-row">
              <button
                className="secondary-action"
                type="button"
                disabled={!hasTranscript || isSubmitting}
                onClick={handleAnalyzeTranscript}
              >
                {isSubmitting ? "Saving and analyzing..." : "Analyze transcript"}
              </button>
              <span className="muted">
                {hasTranscript
                  ? "Create a session, save turns, run analysis, and generate coaching without transcription cost."
                  : "Paste transcript text to enable analysis."}
              </span>
            </div>
            {submitError ? <div className="warning">{submitError}</div> : null}
            <p className="muted">Uploading a transcript is faster and cheaper because AI does not need to transcribe audio.</p>
          </div>
        </Panel>
        <Panel title="Rule-Based Normalization">
          <pre className="sample-block">{transcriptText || "Transcript preview will appear here."}</pre>
          <ul className="check-list">
            <li>Detects optional `Parent:` and `Child:` speaker tags.</li>
            <li>If speaker tags are missing, ask user to mark turns manually or explicitly opt into AI speaker inference.</li>
            <li>Creates ConversationTurn records directly and marks transcript status as transcribed.</li>
            <li>Allows immediate Run Analysis without transcription cost.</li>
          </ul>
          <MetricRow label="Transcript lines" value={String(transcriptLineCount)} />
          <MetricRow
            label="Analysis state"
            value={!hasTranscript ? "Waiting for transcript" : isSubmitting ? "Running analysis" : runtimeBundle ? "Analysis completed" : analysisRequested ? "Ready to generate coaching" : "Ready for analysis"}
          />
          {transcriptUploads.map((upload) => (
            <MetricRow key={upload.id} label={upload.source} value={upload.status} />
          ))}
        </Panel>
      </section>
      {runtimeBundle ? (
        <section className="grid two">
          <Panel title="Test Outcomes">
            <MetricRow label="Session created" value="Yes" />
            <MetricRow label="Transcript turns saved" value={String(runtimeBundle.turns.length)} />
            <MetricRow label="Speaker labels saved" value={runtimeBundle.speakerTagsDetected ? "Yes" : "Unknown speakers need review"} />
            <MetricRow label="Analysis runs" value={runtimeBundle.graph ? "Yes" : "No"} />
            <MetricRow label="Conversation graph appears" value={runtimeBundle.graph?.nodes.length ? "Yes" : "No"} />
            <MetricRow label="Parent coaching appears" value={runtimeBundle.parentAnalysis ? "Yes" : "No"} />
            <MetricRow label="Child coaching appears" value={runtimeBundle.childAnalysis ? "Yes" : "No"} />
            <MetricRow label="No audio stored" value={runtimeBundle.session.audioStoragePath ? "No" : "Yes"} />
          </Panel>
          <Panel title="Open Results">
            <div className="action-row">
              <a className="button-link" href={`/sessions/${runtimeBundle.session.id}`}>Session detail</a>
              <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/graph`}>Conversation graph</a>
              <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/parent`}>Parent coaching</a>
              <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/child`}>Child coaching</a>
              <a className="button-link" href={`/sessions/${runtimeBundle.session.id}/safety`}>Safety review</a>
            </div>
            <p className="muted">Session {runtimeBundle.session.id} is saved in browser state so these pages can load the uploaded results.</p>
          </Panel>
        </section>
      ) : null}
    </section>
  );
}

function SessionsScreen() {
  const [items, setItems] = useState<Session[]>(sessions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const backendSessions = await apiJson<ConversationSession[]>("/api/sessions?familyId=family-demo-1");
        const bundles = await Promise.all(backendSessions.map(async (session) => {
          const local = loadRuntimeSession(session.id);
          return local ?? fetchRuntimeSessionBundle(session.id);
        }));
        if (!cancelled) {
          setItems(bundles.map(toSessionCard).sort((a, b) => b.date.localeCompare(a.date)));
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load sessions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      {loading ? <p className="muted">Loading sessions...</p> : null}
      <SessionList items={items} />
    </section>
  );
}

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(() => loadRuntimeSession(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const bundle = await fetchRuntimeSessionBundle(sessionId);
        if (!cancelled) {
          setRuntimeBundle(bundle);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load session detail.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const detail = sessionAudioUiMap[sessionId] ?? {
    inputMode: "manual_text" as const,
    audioStored: false,
    transcript: ["Transcript unavailable in demo state."],
    analysis: ["No raw audio retained."],
  };
  const transcriptLines = runtimeBundle
    ? runtimeBundle.turns.map((turn) => `${turn.speaker}: ${turn.text}`)
    : detail.transcript;
  const analysisLines = runtimeBundle
    ? [
      `Conversation graph nodes: ${runtimeBundle.graph?.nodes.length ?? 0}`,
      `Parent coaching patterns: ${runtimeBundle.parentAnalysis?.patterns.join(", ") ?? "Not generated"}`,
      `Child coaching feelings: ${runtimeBundle.childAnalysis?.feelings.join(", ") ?? "Not generated"}`,
      runtimeBundle.session.audioStoragePath ? "Audio path exists." : "No raw audio retained.",
    ]
    : detail.analysis;

  return (
    <section className="grid two session-detail-screen">
      {error ? <div className="warning">{error}</div> : null}
      <Panel title="Session Detail">
        <MetricRow label="Session" value={sessionId} />
        <MetricRow label="Input mode" value={runtimeBundle?.session.inputMode ?? detail.inputMode} />
        <MetricRow label="audioStored" value={runtimeBundle?.session.audioStoragePath ? "true" : detail.audioStored ? "true" : "false"} />
        <MetricRow label="Stored data" value="Transcript turns, labels, timestamps, analysis, consent and audit records" />
        <MetricRow label="Raw audio" value="Not stored by default" />
        <p className="muted">Transcript and analysis remain available. Raw audio playback is intentionally not shown.</p>
      </Panel>
      <Panel title="Transcript">
        <div className="timeline">
          {transcriptLines.map((line) => (
            <article key={line}>
              <p>{line}</p>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Analysis">
        <ul className="check-list">
          {analysisLines.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Panel>
      <Panel title="Actions">
        <div className="action-row">
          <a className="button-link" href={`/sessions/${sessionId}/graph`}>View Graph</a>
          <a className="button-link" href={`/sessions/${sessionId}/parent`}>Parent Coaching</a>
          <a className="button-link" href={`/sessions/${sessionId}/child`}>Child Coaching</a>
        </div>
      </Panel>
    </section>
  );
}

function HistoryScreen() {
  const [allItems, setAllItems] = useState<HistorySession[]>(historySessions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterChild, setFilterChild] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const backendSessions = await apiJson<ConversationSession[]>("/api/sessions?familyId=family-demo-1");
        const bundles = await Promise.all(backendSessions.map(async (session) => {
          const local = loadRuntimeSession(session.id);
          return local ?? fetchRuntimeSessionBundle(session.id);
        }));
        if (!cancelled) {
          setAllItems(bundles.map(toHistorySession).sort((a, b) => b.date.localeCompare(a.date)));
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredItems = allItems.filter((session) => {
    if (filterChild && !session.child.toLowerCase().includes(filterChild.toLowerCase())) return false;
    if (filterSituation && !session.situation.toLowerCase().includes(filterSituation.toLowerCase())) return false;
    if (filterLanguage && session.language !== filterLanguage) return false;
    if (filterRisk && session.riskLevel !== filterRisk) return false;
    if (filterFrom && session.date < filterFrom) return false;
    if (filterTo && session.date > filterTo) return false;
    return true;
  });

  function clearFilters() {
    setFilterChild(""); setFilterSituation(""); setFilterLanguage("");
    setFilterRisk(""); setFilterFrom(""); setFilterTo("");
  }

  const hasFilters = filterChild || filterSituation || filterLanguage || filterRisk || filterFrom || filterTo;

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <Panel title="Filters">
        <section className="filter-grid">
          <label>Child
            <select value={filterChild} onChange={(e) => setFilterChild(e.target.value)}>
              <option value="">All children</option>
              {[...new Set(allItems.map((s) => s.child))].map((child) => <option key={child} value={child}>{child}</option>)}
            </select>
          </label>
          <label>Situation
            <select value={filterSituation} onChange={(e) => setFilterSituation(e.target.value)}>
              <option value="">All situations</option>
              {situationOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>Language
            <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}>
              <option value="">All languages</option>
              {languages.map((l) => <option value={l.code} key={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label>Risk level
            <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
              <option value="">All risk levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>From<input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} /></label>
          <label>To<input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} /></label>
        </section>
        <div className="action-row">
          {hasFilters && <button type="button" className="secondary-action" onClick={clearFilters}>Clear filters</button>}
          <span className="muted">{filteredItems.length} of {allItems.length} sessions shown</span>
        </div>
      </Panel>
      <Panel title="Session History">
        {loading ? <p className="muted">Loading history...</p> : null}
        {!loading && filteredItems.length === 0 ? <p className="muted">No sessions match the current filters.</p> : null}
        <div className="history-table">
          <div className="history-header">
            <span>Date</span><span>Child</span><span>Situation</span><span>Language</span>
            <span>Risk</span><span>Parent focus</span><span>Child focus</span>
            <span>Repair</span><span>Escalation</span><span>Status</span><span>Actions</span>
          </div>
          {filteredItems.map((session) => <HistorySessionRow key={session.id} session={session} />)}
        </div>
        <p className="muted">History uses Firestore session metrics for production.</p>
      </Panel>
    </section>
  );
}

function TrendsScreen() {
  const childOptions = getChildOptions();
  const [selectedChildId, setSelectedChildId] = useState(() => getChildOptions()[0]?.id ?? "child_demo_1");
  const [trendPoints, setTrendPoints] = useState<LongitudinalTrendPoint[]>(longitudinalTrendPoints);
  const [insights, setInsights] = useState<Array<{ title: string; type: string; explanation: string; recommendedNextStep: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await apiJson<{
          metrics: LongitudinalTrendPoint[];
          insights: Array<{ title: string; insightType: string; explanation: string; recommendedNextStep: string }>;
        }>(`/api/history/trends?familyId=family-demo-1&childId=${selectedChildId}`);
        if (!cancelled) {
          if (data.metrics.length > 0) setTrendPoints(data.metrics);
          if (data.insights.length > 0) {
            setInsights(data.insights.map((i) => ({
              title: i.title,
              type: i.insightType,
              explanation: i.explanation,
              recommendedNextStep: i.recommendedNextStep,
            })));
          }
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Could not load trends.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChildId]);

  const first = trendPoints[0];
  const last = trendPoints[trendPoints.length - 1];
  const escalationDrop = first && last ? Math.round(((first.escalationRate - last.escalationRate) / Math.max(first.escalationRate, 0.01)) * 100) : 0;
  const triggerCounts = countTriggers(trendPoints);

  const displayInsights = insights.length > 0 ? insights : [
    { title: `Escalation risk changed ${escalationDrop}% across recent sessions.`, type: "improvement", explanation: "Sessions show escalation risk reduced when repair attempts happened earlier.", recommendedNextStep: "Coaching focus could be keeping the pause-before-repeat routine." },
    { title: "Validation before correction in recent sessions.", type: "parent growth", explanation: "Patterns suggest parent validation is becoming more consistent.", recommendedNextStep: "Coaching focus could be one validation sentence before each instruction." },
    { title: "Child used clearer feeling words in recent sessions.", type: "child growth", explanation: "Sessions show clearer feeling and help-request language.", recommendedNextStep: "Coaching focus could be: I feel ___ because ___. I need ___." },
  ];

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <Panel title="Trend Filters">
        <section className="filter-grid">
          <label>Child
            <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {childOptions.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}
            </select>
          </label>
        </section>
        {loading && <p className="muted">Loading trend data...</p>}
      </Panel>
      {first && last && (
        <section className="grid three">
          <TrendMetricCard title="Escalation rate" previous={`${Math.round(first.escalationRate * 100)}%`} current={`${Math.round(last.escalationRate * 100)}%`} note={`${escalationDrop > 0 ? "Dropped" : "Changed"} ${Math.abs(escalationDrop)}% this period`} />
          <TrendMetricCard title="Repair attempts" previous={`${first.repairAttempts} per session`} current={`${last.repairAttempts} per session`} note="Repair attempts over time" />
          <TrendMetricCard title="Parent validation" previous={`${first.parentValidationScore}/100`} current={`${last.parentValidationScore}/100`} note="Validation score trend" />
        </section>
      )}
      <section className="grid two">
        <ProgressLineChart title="Escalation rate over time" points={trendPoints} valueKey="escalationRate" format={(value) => `${Math.round(value * 100)}%`} />
        <ProgressLineChart title="Parent validation score over time" points={trendPoints} valueKey="parentValidationScore" />
        <ProgressLineChart title="Child regulation score over time" points={trendPoints} valueKey="childRegulationScore" />
        <ProgressLineChart title="Repair score over time" points={trendPoints} valueKey="repairScore" />
      </section>
      <TriggerFrequencyChart triggerCounts={triggerCounts} />
      <section className="grid three">
        {displayInsights.map((insight) => <MonthlyInsightCard key={insight.title} {...insight} />)}
      </section>
      <FamilyFocusCard familyId="family-demo-1" childId={selectedChildId} />
    </section>
  );
}

function ConversationGraphScreen({ sessionId }: { sessionId?: string }) {
  const resolvedSessionId = sessionId ?? latestRuntimeSessionId() ?? "";
  const localBundle = resolvedSessionId ? loadRuntimeSession(resolvedSessionId) : null;
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(localBundle);
  const [loading, setLoading] = useState(Boolean(resolvedSessionId) && !localBundle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resolvedSessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading((prev) => prev);
    void (async () => {
      try {
        const bundle = await fetchRuntimeSessionBundle(resolvedSessionId);
        if (!cancelled) { setRuntimeBundle(bundle); setError(null); }
      } catch {
        // Keep showing local bundle if available; only surface error when there's nothing to show
        if (!cancelled && !localBundle) setError("Session not found on server. Start a new session to see the graph.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedSessionId]);

  if (!resolvedSessionId) {
    return (
      <section className="stack">
        <Panel title="No Session Selected">
          <p>Start a new session to see the conversation graph.</p>
          <div className="action-row">
            <a className="button-link" href="/upload-transcript">Upload transcript</a>
            <a className="button-link" href="/upload-audio">Upload audio</a>
            <a className="button-link" href="/record">Record session</a>
          </div>
        </Panel>
      </section>
    );
  }

  if (loading) {
    return <section className="stack"><Panel title="Conversation Graph"><p className="muted">Loading session data...</p></Panel></section>;
  }

  const realNodes = runtimeBundle?.graph?.nodes;
  const nodes = realNodes ?? multilingualGraphNodes.map((node, index) => ({
    id: `mock-node-${index + 1}`,
    nodeType: "coaching" as const,
    title: node.detectedPattern,
    originalUtterance: node.originalUtterance,
    translatedMeaning: node.translatedMeaning,
    originalLanguage: node.originalLanguage,
    analysisConfidence: node.confidence as "high" | "medium" | "low",
    recommendation: node.recommendation,
    sessionId: resolvedSessionId,
    connectedNodes: [],
    severity: undefined,
    speaker: undefined,
  }));

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      {runtimeBundle && !realNodes && !loading && (
        <div className="global-banner">Session loaded — run analysis on the session to generate a real graph. Showing example patterns below.</div>
      )}
      <Panel title="Conversation Graph">
        <div className="graph">
          {nodes.map((node) => (
            <Node key={node.id} label={node.title} />
          ))}
        </div>
        <div className="action-row">
          <a className="button-link" href={`/sessions/${resolvedSessionId}`}>Session detail</a>
          <a className="button-link" href={`/sessions/${resolvedSessionId}/parent`}>Parent coaching</a>
          <a className="button-link" href={`/sessions/${resolvedSessionId}/safety`}>Safety review</a>
        </div>
      </Panel>
      <Panel title="Node Details">
        <div className="grid three">
          {nodes.map((node) => (
            <article className="mini-card" key={node.id}>
              <strong>{node.title}</strong>
              <MetricRow label="Original" value={node.originalUtterance ?? "Not available"} />
              <MetricRow label="Meaning" value={node.translatedMeaning ?? "Not available"} />
              <MetricRow label="Language" value={node.originalLanguage ?? "en-IN"} />
              <MetricRow label="Confidence" value={node.analysisConfidence ?? "low"} />
              <p>{node.recommendation}</p>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function ParentCoachingScreen() {
  return <ParentSessionCoachingScreen sessionId="session-demo" />;
}

function ParentSessionCoachingScreen({ sessionId }: { sessionId: string }) {
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(() => loadRuntimeSession(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await fetchRuntimeSessionBundle(sessionId);
        if (!cancelled) {
          setRuntimeBundle(bundle);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load parent coaching.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const parentAnalysis = runtimeBundle?.parentAnalysis;
  const phraseComparison = parentAnalysis?.phraseComparisons[0];
  const scoreRows = parentAnalysis ? scoreRowsFromParentAnalysis(parentAnalysis.score) : parentAnalysisMock.scores;

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <AnalysisMetaBar generatedAt={parentAnalysis?.generatedAt ?? "2026-05-18T10:45:00.000Z"} analysisVersion={parentAnalysis?.analysisVersion ?? "family-response-intelligence-v11"} cached={Boolean(parentAnalysis?.cacheHit)} admin />
      <ProfessionalReviewBanner
        recommended={parentAnalysis?.professionalReviewRecommended ?? parentAnalysisMock.reviewRecommended}
        reason={parentAnalysis?.safetyReason ?? "If language suggests severe aggression, intimidation, abuse, self-harm threats, or violence, professional review is recommended and normal coaching is not shown alone."}
      />
      <section className="grid two">
        <ParentPatternCard patterns={parentAnalysis?.patterns ?? parentAnalysisMock.patterns} />
        <ParentCoachingScoreCard scores={scoreRows} />
      </section>
      <PhraseComparisonCard
        original={phraseComparison?.originalPhrase ?? parentAnalysisMock.phraseComparison.original}
        detected={phraseComparison?.detectedPattern ?? parentAnalysisMock.phraseComparison.detected}
        impact={phraseComparison?.impactOnChildResponse ?? parentAnalysisMock.phraseComparison.impact}
        better={phraseComparison?.betterAlternative ?? parentAnalysisMock.phraseComparison.better}
      />
      <ParentScriptBuilder sessionId={sessionId} />
      <UserTriggeredAiPanel sessionId={sessionId} familyId="family-demo-1" />
      <PracticePlanCard items={parentAnalysis?.practicePlan ?? parentPracticePlan} />
      <Panel title="Cost Controls">
        <MetricRow label="Session" value={sessionId} />
        <MetricRow label="Default script generation" value="Rule-based template" />
        <MetricRow label="Gemini" value="Only if user clicks Generate personalized script" />
        <MetricRow label="Generated output cache" value="Stored by session and prompt version" />
      </Panel>
    </section>
  );
}

function KidSelfCoachingScreen() {
  return <ChildSessionCoachingScreen sessionId="session-demo" />;
}

function ChildSessionCoachingScreen({ sessionId }: { sessionId: string }) {
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(() => loadRuntimeSession(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await fetchRuntimeSessionBundle(sessionId);
        if (!cancelled) {
          setRuntimeBundle(bundle);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load child coaching.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const childAnalysis = runtimeBundle?.childAnalysis;

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <AnalysisMetaBar generatedAt={childAnalysis?.generatedAt ?? "2026-05-18T10:45:00.000Z"} analysisVersion={childAnalysis?.analysisVersion ?? "family-response-intelligence-v11"} cached={Boolean(childAnalysis?.cacheHit)} />
      <ReactRespondFlow />
      <section className="grid two">
        <FeelingCards feelings={childAnalysis?.feelings ?? childFeelings} />
        <SentenceBuilder />
      </section>
      <section className="grid five">
        {(childAnalysis?.reflectionCards.map((card) => card.prompt) ?? ["What happened?", "What did I feel?", "What did I say?", "Did it make the problem bigger or smaller?", "What will I try next time?"]).map((prompt) => (
          <ReflectionCard key={prompt} prompt={prompt} />
        ))}
      </section>
      <Panel title="Practice Game">
        <div className="grid two">
          {(childAnalysis?.practiceScenarios ?? childPracticeScenarios).map((scenario) => (
            <PracticeScenarioCard key={scenario.situation} {...scenario} />
          ))}
        </div>
      </Panel>
      <BadgeProgress badges={childAnalysis?.badges ?? kidBadges} />
      <Panel title="Cost Controls">
        <MetricRow label="Session" value={sessionId} />
        <MetricRow label="Uses existing turns" value="Yes" />
        <MetricRow label="AI on page load" value="No" />
        <MetricRow label="Analysis mode" value="Rule-based first" />
      </Panel>
    </section>
  );
}

function TherapistDashboardScreen() {
  const [home, setHome] = useState(() => getTherapistHome());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<ReturnType<typeof getTherapistHome>>("/api/therapist/families", {
          headers: {
            "x-user-id": "user_therapist_1",
            "x-user-role": "therapist",
          },
        });
        if (!cancelled) {
          setHome(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load therapist dashboard.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <section className="grid three">
        <Panel title="Assigned Families">
          {home.assignedFamilies.map((family) => (
            <article className="mini-card" key={family.id}>
              <a href={`/therapist/families/${family.id}`}><strong>{family.name}</strong></a>
              <span>{family.childName} · {family.recentSessionCount} recent sessions</span>
              <span>{family.therapistShareConsentGranted ? "therapist_share consent granted" : "Consent required"}</span>
            </article>
          ))}
        </Panel>
        <Panel title="Recent Sessions">
          {home.recentSessions.map((session) => (
            <MetricRow key={session.id} label={session.situation} value={`${session.language} · ${session.status.replace("_", " ")}`} />
          ))}
        </Panel>
        <Panel title="High-Risk / Pending Review">
          {home.pendingReviewSessions.filter((session) => session.status === "pending_review" || session.riskLevel === "high").map((session) => (
            <article className="mini-card" key={session.id}>
              <a href={`/therapist/sessions/${session.id}`}><strong>{session.situation}</strong></a>
              <span>{session.familyName} · risk {session.riskLevel}</span>
              <span>{session.summary}</span>
            </article>
          ))}
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Professional Workspace">
          <MetricRow label="AI diagnosis" value="Not shown or stored" />
          <MetricRow label="Primary language" value="Observed patterns and coaching signals" />
          <MetricRow label="Dashboard cost" value="Cached analysis, no Gemini on load" />
          <MetricRow label="Access control" value="Assigned families with therapist_share consent" />
        </Panel>
        <Panel title="Audit Events">
          <ul className="check-list">
            <li>Therapist opened session.</li>
            <li>Therapist added note.</li>
            <li>Therapist exported summary.</li>
          </ul>
        </Panel>
      </section>
    </section>
  );
}

function SafetyRiskScreen({ sessionId }: { sessionId: string }) {
  const [runtimeBundle, setRuntimeBundle] = useState<RuntimeSessionBundle | null>(() => loadRuntimeSession(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await fetchRuntimeSessionBundle(sessionId);
        if (!cancelled) {
          setRuntimeBundle(bundle);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load safety review.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const assessment = runtimeBundle?.riskAssessment?.assessment ?? assessSafetyRisk(sessionId, runtimeBundle?.turns ?? safetyDemoTurns);

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <SafetyReviewBanner assessment={assessment} />
      <section className="grid two">
        <Panel title="Risk Assessment">
          <MetricRow label="Session" value={sessionId} />
          <MetricRow label="Risk level" value={assessment.riskLevel} />
          <MetricRow label="Normal coaching primary" value={assessment.blockNormalCoaching ? "Blocked" : "Allowed"} />
          <MetricRow label="Professional review" value={assessment.requireProfessionalReview ? "Required" : "Not required"} />
        </Panel>
        <Panel title="Detected Categories">
          {assessment.riskCategories.length > 0 ? (
            <div className="tag-row">{assessment.riskCategories.map((category) => <span key={category}>{category.replaceAll("_", " ")}</span>)}</div>
          ) : (
            <p className="muted">No configured high-risk category was detected.</p>
          )}
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Detected Phrases">
          {assessment.detectedPhrases.length > 0 ? (
            <ul className="check-list">{assessment.detectedPhrases.map((phrase) => <li key={phrase}>{phrase}</li>)}</ul>
          ) : (
            <p className="muted">No configured high-risk phrase was detected.</p>
          )}
        </Panel>
        <Panel title="Recommended Action">
          <p>{assessment.recommendedAction}</p>
          <p className="muted">This screen does not gamify high-risk events and does not claim that AI confirms abuse or self-harm.</p>
        </Panel>
      </section>
    </section>
  );
}

function TherapistFamilySummaryScreen({ familyId }: { familyId: string }) {
  const [summary, setSummary] = useState(() => getTherapistFamilySummary(familyId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<ReturnType<typeof getTherapistFamilySummary>>(`/api/therapist/families/${familyId}/summary`, {
          headers: {
            "x-user-id": "user_therapist_1",
            "x-user-role": "therapist",
          },
        });
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load therapist family summary.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <section className="grid four">
        <Panel title="Family Access">
          <MetricRow label="Family" value={summary.familyName} />
          <MetricRow label="Child" value={summary.childName} />
          <MetricRow label="Consent" value={summary.therapistShareConsentGranted ? "Granted" : "Required"} />
        </Panel>
        <Panel title="Top Triggers">
          <div className="tag-row">{summary.topTriggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div>
        </Panel>
        <Panel title="Repair Score Trend">
          <TrendBars values={summary.repairScoreTrend} suffix="/100" />
        </Panel>
        <Panel title="Escalation Trend">
          <TrendBars values={summary.escalationTrend} suffix="%" />
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Parent Response Trends">
          <ul className="check-list">{summary.parentResponseTrends.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Child Response Trends">
          <ul className="check-list">{summary.childResponseTrends.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Safety / Risk Events">
          <ul className="check-list">{summary.safetyRiskEvents.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Home Practice Completion">
          <MetricRow label="Completion" value={`${summary.homePracticeCompletion}%`} />
          <p className="muted">{summary.cachedSummary}</p>
        </Panel>
      </section>
    </section>
  );
}

function TherapistSessionReviewScreen({ sessionId }: { sessionId: string }) {
  const [review, setReview] = useState(() => getTherapistSessionReview(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<ReturnType<typeof getTherapistSessionReview>>(`/api/therapist/sessions/${sessionId}`, {
          headers: {
            "x-user-id": "user_therapist_1",
            "x-user-role": "therapist",
          },
        });
        if (!cancelled) {
          setReview(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load therapist session review.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      <AnalysisMetaBar generatedAt="2026-05-18T10:45:00.000Z" analysisVersion="family-response-intelligence-v11" cached admin />
      <ProfessionalReviewBanner
        recommended={review.riskFlags.some((flag) => flag.includes("Professional review"))}
        reason={`${review.consentRequired} consent checked. ${review.cachedProfessionalSummary}`}
      />
      <section className="grid two">
        <Panel title="Session Review">
          <MetricRow label="Family" value={review.session.familyName} />
          <MetricRow label="Situation" value={review.session.situation} />
          <MetricRow label="Language" value={review.session.language} />
          <MetricRow label="Risk flag" value={review.session.riskLevel} />
        </Panel>
        <Panel title="AI-Generated Professional Summary">
          <p>{review.cachedProfessionalSummary}</p>
          <p className="muted">Loaded from cached analysis. Gemini should not run on dashboard load.</p>
        </Panel>
      </section>
      <Panel title="Transcript Timeline">
        <div className="timeline">
          {review.transcriptTimeline.map((turn) => (
            <article key={`${turn.time}-${turn.text}`}>
              <strong>{turn.time} · {turn.speaker}</strong>
              <p>{turn.text}</p>
              <span>{turn.emotionalSignal}</span>
            </article>
          ))}
        </div>
      </Panel>
      <section className="grid two">
        <Panel title="Conversation Graph">
          <div className="graph">
            {review.conversationGraph.map((node) => (
              <div className="graph-node" key={node.label}>
                <span>{node.label}<br /><small>{node.detectedPattern} · {node.confidence}</small></span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Risk Flags">
          <ul className="check-list">{review.riskFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
        </Panel>
        <Panel title="Parent Coaching Observations">
          <ul className="check-list">{review.parentCoachingObservations.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Child Coping Signals">
          <ul className="check-list">{review.childCopingSignals.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
      </section>
      <section className="grid three">
        <ProfessionalNoteForm sessionId={sessionId} />
        <AssignPracticePanel sessionId={sessionId} />
        <ExportSummaryPanel review={review} />
      </section>
      <UserTriggeredAiPanel sessionId={sessionId} familyId="family-demo-1" therapist />
    </section>
  );
}

function AnalysisMetaBar({
  generatedAt,
  analysisVersion,
  cached,
  admin,
}: {
  generatedAt: string;
  analysisVersion: string;
  cached: boolean;
  admin?: boolean;
}) {
  return (
    <div className="analysis-meta">
      <span className={cached ? "cache-badge cached" : "cache-badge"}>{cached ? "Cached" : "Generated"}</span>
      <span>Generated {new Date(generatedAt).toLocaleString()}</span>
      <span>{analysisVersion}</span>
      {admin ? <button type="button" onClick={() => window.location.reload()}>Regenerate</button> : null}
    </div>
  );
}

type AiOutput = { purpose: string; text: string; provider: string; cacheHit: boolean; cachedBadge: string };

function UserTriggeredAiPanel({ sessionId = "session-001", familyId = "family-demo-1", therapist }: { sessionId?: string; familyId?: string; therapist?: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<AiOutput[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runAi(purpose: "deeper_insight" | "parent_script" | "therapist_summary") {
    setLoading(purpose);
    setError(null);
    try {
      const result = await apiJson<AiOutput>(`/api/sessions/${sessionId}/ai/personalize`, {
        method: "POST",
        body: JSON.stringify({ purpose, familyId, childAgeRange: "9-12" }),
      });
      setResults((prev) => {
        const without = prev.filter((r) => r.purpose !== purpose);
        return [...without, result];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Panel title="Optional AI Personalization">
      {error ? <div className="warning">{error}</div> : null}
      <div className="action-row">
        <button className="secondary-action" type="button" disabled={Boolean(loading)} onClick={() => void runAi("deeper_insight")}>
          {loading === "deeper_insight" ? "Generating..." : "Generate deeper insight"}
        </button>
        <button className="secondary-action" type="button" disabled={Boolean(loading)} onClick={() => void runAi("parent_script")}>
          {loading === "parent_script" ? "Generating..." : "Generate personalized parent script"}
        </button>
        {therapist && (
          <button className="secondary-action" type="button" disabled={Boolean(loading)} onClick={() => void runAi("therapist_summary")}>
            {loading === "therapist_summary" ? "Generating..." : "Create therapist summary"}
          </button>
        )}
      </div>
      {results.map((result) => (
        <article className="mini-card" key={result.purpose}>
          <div className="action-row">
            <strong>{result.purpose.replaceAll("_", " ")}</strong>
            <span className={`cache-badge ${result.cacheHit ? "cached" : ""}`}>{result.cachedBadge}</span>
            <span className="muted">{result.provider}</span>
          </div>
          <p>{result.text}</p>
        </article>
      ))}
      <p className="muted">User-triggered, rate-limited, cached by input hash. Not run automatically on page load.</p>
    </Panel>
  );
}

function ProfessionalNoteForm({ sessionId = "session-001" }: { sessionId?: string }) {
  const [note, setNote] = useState("");
  const [formulation, setFormulation] = useState("");
  const [practice, setPractice] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [visibility, setVisibility] = useState("private_to_therapist");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNote() {
    if (!note.trim()) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiJson(`/api/therapist/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "x-user-id": "user_therapist_1", "x-user-role": "therapist" },
        body: JSON.stringify({ note, formulation, recommendedPractice: practice, followUpDate, visibility }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Professional Note">
      {error ? <div className="warning">{error}</div> : null}
      {saved ? <div className="success-banner">Note saved.</div> : null}
      <div className="form-grid">
        <label>Note<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observed patterns and clinical observations." /></label>
        <label>Formulation / observation<textarea value={formulation} onChange={(e) => setFormulation(e.target.value)} placeholder="How the situation escalated and what helped repair it." /></label>
        <label>Recommended home practice<textarea value={practice} onChange={(e) => setPractice(e.target.value)} placeholder="One validation sentence before correction for the next seven days." /></label>
        <label>Follow-up date<input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></label>
        <label>Visibility
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="private_to_therapist">Private to therapist</option>
            <option value="shared_with_parent">Shared with parent</option>
          </select>
        </label>
      </div>
      <button className="secondary-action" type="button" disabled={!note.trim() || saving} onClick={() => void saveNote()}>
        {saving ? "Saving..." : "Save note"}
      </button>
    </Panel>
  );
}

function AssignPracticePanel({ sessionId = "session-001" }: { sessionId?: string }) {
  const [practiceType, setPracticeType] = useState("parent_validation_practice");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assignPractice() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiJson(`/api/therapist/sessions/${sessionId}/assign-practice`, {
        method: "POST",
        headers: { "x-user-id": "user_therapist_1", "x-user-role": "therapist" },
        body: JSON.stringify({ practiceType, instructions, dueDate }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign practice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Assign Practice">
      {error ? <div className="warning">{error}</div> : null}
      {saved ? <div className="success-banner">Practice assigned.</div> : null}
      <div className="form-grid">
        <label>Practice type
          <select value={practiceType} onChange={(e) => setPracticeType(e.target.value)}>
            <option value="parent_validation_practice">Parent validation practice</option>
            <option value="child_feeling_sentence_practice">Child feeling sentence practice</option>
            <option value="calm_boundary_practice">Calm boundary practice</option>
            <option value="repair_conversation_practice">Repair conversation practice</option>
            <option value="screen_time_agreement">Screen-time agreement</option>
            <option value="homework_start_routine">Homework start routine</option>
          </select>
        </label>
        <label>Instructions<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Practice Observe → Validate → Boundary → Small Next Step during homework start." /></label>
        <label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </div>
      <button className="secondary-action" type="button" disabled={saving} onClick={() => void assignPractice()}>
        {saving ? "Assigning..." : "Assign practice"}
      </button>
    </Panel>
  );
}

function ExportSummaryPanel({ review }: { review: ReturnType<typeof getTherapistSessionReview> }) {
  return (
    <Panel title="Export Summary">
      <MetricRow label="Session date" value={review.session.date} />
      <MetricRow label="Situation" value={review.session.situation} />
      <MetricRow label="Printable" value="Observed patterns, coaching suggestions, practice plan" />
      <p className="muted">Disclaimer: This summary supports coaching and professional review. It is not a medical diagnosis.</p>
    </Panel>
  );
}

function TrendBars({ values, suffix }: { values: number[]; suffix: string }) {
  return (
    <div className="trend-bars">
      {values.map((value, index) => (
        <span style={{ height: `${Math.max(value, 12)}%` }} key={`${value}-${index}`}>{value}{suffix}</span>
      ))}
    </div>
  );
}

function LocalisationScreen() {
  const hindiConfig = getLanguageConfig("hi-IN");
  const [uiLang, setUiLang] = useState<SupportedLanguage>("en-IN");
  const [transcriptLang, setTranscriptLang] = useState<SupportedLanguage>("en-IN");
  const [recoLang, setRecoLang] = useState<SupportedLanguage>("hi-IN");
  const [childLevel, setChildLevel] = useState("preteen");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await apiJson("/api/language-preferences", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          userId: "parent_demo_1",
          preferredLanguage: uiLang,
          transcriptLanguage: transcriptLang,
          coachingLanguage: recoLang,
          recommendationLanguage: recoLang,
          uiLanguage: uiLang,
          childFriendlyLanguageLevel: childLevel,
        }),
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid two">
      <Panel title="Language Settings">
        {saved ? <div className="success-banner">Preferences saved.</div> : null}
        {saveError ? <div className="warning">{saveError}</div> : null}
        <div className="form-grid">
          <label>UI language<select value={uiLang} onChange={(e) => setUiLang(e.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
          <label>Transcript language<select value={transcriptLang} onChange={(e) => setTranscriptLang(e.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
          <label>Recommendation language<select value={recoLang} onChange={(e) => setRecoLang(e.target.value as SupportedLanguage)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
          <label>Child-friendly language level<select value={childLevel} onChange={(e) => setChildLevel(e.target.value)}><option value="early_reader">Early reader</option><option value="preteen">Preteen</option><option value="teen">Teen</option><option value="plain">Plain family language</option></select></label>
        </div>
        <button className="primary-action" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save preferences"}</button>
      </Panel>
      <Panel title="Localisation Policy">
        <MetricRow label="Initial languages" value="English India, Hindi India, Telugu India, Tamil India" />
        <MetricRow label="Static UI dictionaries" value="Enabled" />
        <MetricRow label="AI on page load" value="No" />
        <MetricRow label="Translated scripts" value="Cacheable final output only" />
        <p className="muted">Coaching stays simple and culturally sensitive. It focuses on respectful communication, emotional regulation, safety, and boundaries rather than hierarchy or obedience.</p>
        <pre className="sample-block">English: I hear that this is hard. We still need a safe boundary.{`\n\n`}{hindiConfig.displayName}: {hindiConfig.culturallySafeExamples[0]}</pre>
      </Panel>
    </section>
  );
}

function PrivacyScreen() {
  const [auditEvents, setAuditEvents] = useState<Array<{ eventType: string; createdAt: string; details: string }>>([]);
  const [exporting, setExporting] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"one_session" | "child_profile" | "all_family_data">("one_session");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const events = await apiJson<Array<{ eventType: string; createdAt: string; details: string }>>("/api/audit-logs?familyId=family-demo-1");
        if (!cancelled) {
          setAuditEvents(events);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load audit log.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestExport = async () => {
    setExporting(true);
    setActionMessage(null);
    setError(null);
    try {
      const bundle = await apiJson<{ id: string; files: Array<{ label: string }> }>("/api/privacy/export-data", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          exportTypes: ["session_summaries", "transcript", "recommendations", "parent_visible_therapist_notes"],
        }),
      });
      setActionMessage(`Export bundle ${bundle.id} created with ${bundle.files.length} files.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not request export.");
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    setActionMessage(null);
    setError(null);
    try {
      const latestSession = latestRuntimeSessionId();
      if (!latestSession) {
        throw new Error("No session available to delete yet.");
      }
      const deleted = await apiJson<{ sessionId: string; deleteMode: string }>("/api/privacy/delete-session", {
        method: "POST",
        body: JSON.stringify({
          sessionId: latestSession,
          familyId: "family-demo-1",
          deleteMode,
        }),
      });
      setActionMessage(`Deletion request submitted for ${deleted.sessionId} using ${deleted.deleteMode}.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not request deletion.");
    }
  };

  return (
    <section className="stack">
      {error ? <div className="warning">{error}</div> : null}
      {actionMessage ? <div className="global-banner">{actionMessage}</div> : null}
      <section className="grid two">
        <Panel title="Child-Friendly Notice">
          <p className="notice-text">{childFriendlyNotice}</p>
          <p className="muted">No hidden recording. Parents must grant consent before recording, sharing, retention, or research use.</p>
        </Panel>
        <Panel title="Privacy Safety Principles">
          <ul className="check-list">{privacySafetyPrinciples.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
      </section>
      <section className="grid three">
        <Panel title="Data Export">
          <ul className="check-list">
            <li>Session summaries</li>
            <li>Transcript</li>
            <li>Recommendations</li>
            <li>Therapist notes visible to parent</li>
          </ul>
          <button className="secondary-action" type="button" onClick={requestExport} disabled={exporting}>
            {exporting ? "Creating export..." : "Export selected data"}
          </button>
        </Panel>
        <Panel title="Delete Data">
          <div className="form-grid">
            <label>Delete scope<select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value as typeof deleteMode)}><option value="one_session">One session</option><option value="child_profile">Child profile</option><option value="all_family_data">All family data</option></select></label>
            <button className="danger-action" type="button" onClick={requestDeletion}>Request deletion</button>
          </div>
        </Panel>
        <Panel title="Audit Log">
          {auditEvents.length > 0 ? auditEvents.slice(-6).reverse().map((event) => (
            <MetricRow key={`${event.createdAt}-${event.eventType}`} label={event.eventType.replaceAll("_", " ")} value={new Date(event.createdAt).toLocaleDateString()} />
          )) : (
            <p className="muted">No privacy audit events yet.</p>
          )}
        </Panel>
      </section>
    </section>
  );
}

function ConsentSettingsScreen() {
  const consentRows = [
    ["Recording consent", "recording"],
    ["Therapist sharing consent", "therapist_share"],
    ["Data retention consent", "data_retention"],
    ["Research opt-in", "research_opt_in"],
  ] as const;
  const [consents, setConsents] = useState<Array<{ id: string; consentType: string; status: string }>>([]);
  const [savingConsent, setSavingConsent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Array<{ id: string; consentType: string; status: string }>>("/api/privacy/consents?familyId=family-demo-1");
        if (!cancelled) {
          setConsents(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load consents.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isGranted = (consentType: string) => consents.some((consent) => consent.consentType === consentType && consent.status === "granted");

  const toggleConsent = async (consentType: typeof consentRows[number][1], checked: boolean) => {
    setSavingConsent(consentType);
    setError(null);
    try {
      if (checked) {
        await apiJson("/api/privacy/consents", {
          method: "POST",
          body: JSON.stringify({
            familyId: "family-demo-1",
            childId: "child_demo_1",
            parentUserId: "parent_demo_1",
            consentType,
          }),
        });
      } else {
        const active = consents.find((consent) => consent.consentType === consentType && consent.status === "granted");
        if (active) {
          await apiJson(`/api/privacy/consents/${active.id}`, {
            method: "DELETE",
          });
        }
      }
      const refreshed = await apiJson<Array<{ id: string; consentType: string; status: string }>>("/api/privacy/consents?familyId=family-demo-1");
      setConsents(refreshed);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not update consent.");
    } finally {
      setSavingConsent(null);
    }
  };

  return (
    <section className="grid two">
      {error ? <div className="warning">{error}</div> : null}
      <Panel title="Consent Management">
        <div className="consent-list">
          {consentRows.map(([label, value]) => (
            <label className="toggle-row" key={value}>
              <span>{label}</span>
              <input type="checkbox" checked={isGranted(value)} disabled={savingConsent === value} onChange={(event) => void toggleConsent(value, event.target.checked)} />
            </label>
          ))}
        </div>
      </Panel>
      <Panel title="Consent Rules">
        <p className="notice-text">{childFriendlyNotice}</p>
        <ul className="check-list">
          <li>Recording and upload are disabled without recording consent.</li>
          <li>Therapist review requires therapist sharing consent.</li>
          <li>Research opt-in is separate and off by default.</li>
          <li>Revocation creates an audit log entry.</li>
          <li>Live audio and uploaded audio are processed for transcription and discarded by default.</li>
        </ul>
      </Panel>
    </section>
  );
}

function DataRetentionScreen() {
  const [audioOption, setAudioOption] = useState(audioRetentionOptions[0]);
  const [transcriptOption, setTranscriptOption] = useState(transcriptRetentionOptions[0]);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await apiJson("/api/privacy/retention-settings", {
      method: "POST",
      body: JSON.stringify({ familyId: "family-demo-1", audioRetention: audioOption, transcriptRetention: transcriptOption }),
    }).catch(() => {});
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="grid two">
      <Panel title="Audio Retention Settings">
        {saved ? <div className="success-banner">Retention settings saved.</div> : null}
        <div className="form-grid">
          {audioRetentionOptions.map((option) => (
            <label className="radio-row" key={option}>
              <input type="radio" name="audio-retention" checked={audioOption === option} onChange={() => { setAudioOption(option); setSaved(false); }} />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <p className="muted">Default: no raw-audio storage. If STORE_RAW_AUDIO is explicitly enabled later, GCS lifecycle deletes objects under raw-audio/ after AUDIO_RETENTION_DAYS.</p>
        <button className="primary-action" type="button" onClick={save}>Save retention settings</button>
      </Panel>
      <Panel title="Transcript Retention Settings">
        <div className="form-grid">
          {transcriptRetentionOptions.map((option) => (
            <label className="radio-row" key={option}>
              <input type="radio" name="transcript-retention" checked={transcriptOption === option} onChange={() => { setTranscriptOption(option); setSaved(false); }} />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <p className="muted">Do not keep duplicate transcripts. If transcript text is deleted, keep only compressed summaries when selected.</p>
      </Panel>
    </section>
  );
}

function TherapistSharingSettingsScreen() {
  const [consents, setConsents] = useState<Array<{ consentType: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Array<{ consentType: string; status: string }>>("/api/privacy/consents?familyId=family-demo-1");
        if (!cancelled) {
          setConsents(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load therapist sharing consent.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sharingGranted = consents.some((consent) => consent.consentType === "therapist_share" && consent.status === "granted");

  return (
    <section className="grid two">
      {error ? <div className="warning">{error}</div> : null}
      <Panel title="Therapist Sharing Consent">
        <MetricRow label="Sharing status" value={sharingGranted ? "Granted" : "Consent required"} />
        <MetricRow label="Visible data" value="Summaries, transcript turns, analysis nodes, parent-visible notes" />
        <MetricRow label="Raw audio" value="Never shared by default" />
      </Panel>
      <Panel title="Assignments">
        <ul className="check-list">
          <li>Therapist can only access consented assigned families.</li>
          <li>Clinical admin can access risk queue.</li>
          <li>Support staff cannot view transcripts.</li>
        </ul>
      </Panel>
    </section>
  );
}

function DeleteDataSettingsScreen() {
  const [deleteMode, setDeleteMode] = useState<"one_session" | "child_profile" | "all_family_data">("one_session");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitDeleteRequest = async () => {
    setMessage(null);
    setError(null);
    try {
      const latestSession = latestRuntimeSessionId();
      if (!latestSession) {
        throw new Error("No session available to delete yet.");
      }
      const deleted = await apiJson<{ sessionId: string; deleteMode: string }>("/api/privacy/delete-session", {
        method: "POST",
        body: JSON.stringify({
          sessionId: latestSession,
          familyId: "family-demo-1",
          deleteMode,
        }),
      });
      setMessage(`Deletion request created for ${deleted.sessionId} with ${deleted.deleteMode}.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not create deletion request.");
    }
  };

  return (
    <Panel title="Delete Data">
      {error ? <div className="warning">{error}</div> : null}
      {message ? <div className="global-banner">{message}</div> : null}
      <div className="form-grid">
        <label>Deletion scope<select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value as typeof deleteMode)}><option value="one_session">One session</option><option value="child_profile">Child profile</option><option value="all_family_data">All family data</option></select></label>
        <label>Confirmation<textarea value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Describe the deletion request." /></label>
        <button className="danger-action" type="button" disabled={!confirmation.trim()} onClick={submitDeleteRequest}>Create deletion request</button>
      </div>
      <p className="muted">Deletion requests are audited. Raw audio is not stored by default.</p>
    </Panel>
  );
}

function ExportDataSettingsScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestExport = async () => {
    setMessage(null);
    setError(null);
    try {
      const bundle = await apiJson<{ id: string; files: Array<{ label: string }> }>("/api/privacy/export-data", {
        method: "POST",
        body: JSON.stringify({
          familyId: "family-demo-1",
          exportTypes: ["session_summaries", "transcript", "recommendations", "parent_visible_therapist_notes"],
        }),
      });
      setMessage(`Export request created: ${bundle.id} with ${bundle.files.length} files.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not request export.");
    }
  };

  return (
    <Panel title="Export Data">
      {error ? <div className="warning">{error}</div> : null}
      {message ? <div className="global-banner">{message}</div> : null}
      <ul className="check-list">
        <li>Session summaries</li>
        <li>Transcript turns</li>
        <li>Recommendations</li>
        <li>Therapist notes visible to parent</li>
      </ul>
      <button className="secondary-action" type="button" onClick={requestExport}>Request export</button>
      <p className="muted">Export excludes raw audio paths because raw audio is not stored by default.</p>
    </Panel>
  );
}

type TherapistPracticeTemplate = {
  id: string;
  title: string;
  description: string;
  intendedFor: "parent" | "child" | "family";
};

type TherapistNoteTemplate = {
  id: string;
  title: string;
  body: string;
};

const therapistPracticeTemplates: TherapistPracticeTemplate[] = [
  { id: "parent_validation_practice", title: "Parent validation practice", description: "Use one validation sentence before correction.", intendedFor: "parent" },
  { id: "calm_boundary_practice", title: "Calm boundary practice", description: "Hold the boundary without raising intensity.", intendedFor: "parent" },
  { id: "child_feeling_sentence_practice", title: "Child feeling sentence practice", description: "Name feeling, need, and next step.", intendedFor: "child" },
  { id: "repair_conversation_practice", title: "Repair conversation practice", description: "Return to the conversation after escalation.", intendedFor: "family" },
  { id: "screen_time_agreement", title: "Screen-time agreement", description: "Create a predictable agreement with explicit limits.", intendedFor: "family" },
  { id: "homework_start_routine", title: "Homework start routine", description: "Lower friction by breaking the start into one small step.", intendedFor: "family" },
];

const therapistNoteTemplates: TherapistNoteTemplate[] = [
  { id: "initial_observation", title: "Initial observation", body: "Observed correction-before-connection pattern followed by a partial repair attempt." },
  { id: "parent_coaching_focus", title: "Parent coaching focus", body: "One validation sentence before each instruction; keep boundaries calm and specific." },
  { id: "child_regulation_focus", title: "Child regulation focus", body: "Use feeling words, ask for help, and pause before reacting." },
  { id: "safety_follow_up", title: "Safety follow-up", body: "High-risk language requires professional judgement and immediate review." },
  { id: "home_practice_assignment", title: "Home practice assignment", body: "Practice the Observe -> Validate -> Boundary -> Small Next Step sequence." },
];

function TherapistAdminScreen({ path }: { path: string }) {
  const section = path.split("/").at(-1) ?? "admin";
  return (
    <section className="stack">
      <AdminRouteGrid title="Therapist Admin Routes" routes={therapistAdminRoutes} />
      {path === "/therapist/admin" ? <TherapistAdminHomeScreen /> : null}
      {section === "families" ? <TherapistFamilyAdminScreen path={path} /> : null}
      {section === "cases" ? <TherapistCasesAdminScreen /> : null}
      {section === "session-review" ? <TherapistSessionReviewAdminScreen path={path} /> : null}
      {section === "risk-queue" ? <TherapistRiskQueueScreen /> : null}
      {section === "practice-library" ? <TherapistPracticeLibraryScreen /> : null}
      {section === "progress-reports" ? <TherapistProgressReportsScreen /> : null}
      {section === "notes-templates" ? <TherapistNotesTemplateScreen /> : null}
      {path !== "/therapist/admin" && !["families", "cases", "session-review", "risk-queue", "practice-library", "progress-reports", "notes-templates"].includes(section) ? (
        <Panel title="Therapist Admin Overview">
          <MetricRow label="Current section" value={section.replaceAll("-", " ")} />
          <MetricRow label="AI diagnosis" value="Not shown or stored" />
          <MetricRow label="AI output" value="Professional judgement required" />
        </Panel>
      ) : null}
    </section>
  );
}

function TherapistAdminHomeScreen() {
  const home = getTherapistHome();
  const improvedFamilies = home.assignedFamilies.filter((family) => family.pendingReviewCount === 0 || family.highRiskCount === 0);

  return (
    <section className="stack">
      <p className="review-banner">AI-generated observations require professional judgement.</p>
      <section className="grid three">
        <Panel title="Assigned Families">
          {home.assignedFamilies.map((family) => (
            <article className="mini-card" key={family.id}>
              <a href={`/therapist/admin/families?family=${family.id}`}><strong>{family.name}</strong></a>
              <span>{family.childName} · {family.recentSessionCount} recent sessions</span>
              <span>{family.therapistShareConsentGranted ? "therapist_share consent granted" : "Consent required"}</span>
            </article>
          ))}
        </Panel>
        <Panel title="Open Cases">
          {home.recentSessions.map((session) => (
            <MetricRow key={session.id} label={session.situation} value={`${session.familyName} · ${session.status.replace("_", " ")}`} />
          ))}
        </Panel>
        <Panel title="Pending Reviews">
          {home.pendingReviewSessions.length > 0 ? home.pendingReviewSessions.map((session) => (
            <MetricRow key={session.id} label={session.situation} value={`${session.familyName} · ${session.riskLevel}`} />
          )) : <p className="muted">No pending reviews.</p>}
        </Panel>
      </section>
      <section className="grid three">
        <Panel title="High-Risk Sessions">
          {home.highRiskSessions.length > 0 ? home.highRiskSessions.map((session) => (
            <MetricRow key={session.id} label={session.situation} value={`${session.familyName} · ${session.riskLevel}`} />
          )) : <p className="muted">No high-risk sessions in the assigned set.</p>}
        </Panel>
        <Panel title="Recently Improved Families">
          {improvedFamilies.map((family) => (
            <MetricRow key={family.id} label={family.name} value={`${family.childName} · improvement noted`} />
          ))}
        </Panel>
        <Panel title="Practice Plans Assigned">
          <ul className="check-list">
            {therapistPracticeTemplates.slice(0, 4).map((template) => <li key={template.id}>{template.title}</li>)}
          </ul>
        </Panel>
      </section>
      <Panel title="Workspace Guidance">
        <ul className="check-list">
          <li>No AI diagnosis.</li>
          <li>AI-generated observations require professional judgement.</li>
          <li>Session review stays scoped to consented and assigned families.</li>
        </ul>
      </Panel>
    </section>
  );
}

function TherapistFamilyAdminScreen({ path }: { path: string }) {
  const home = getTherapistHome();
  return (
    <section className="stack">
      <Panel title="Consented Assigned Families">
        <div className="grid two">
          {home.assignedFamilies.map((family) => (
            <article className="mini-card" key={family.id}>
              <strong>{family.name}</strong>
              <span>Child age range: {family.childName === "Aarav" ? "9-12" : "6-8"}</span>
              <span>Top trigger: {family.id === "family-demo-1" ? "homework start" : "screen-time ending"}</span>
              <span>Recent risk level: {family.highRiskCount > 0 ? "high" : "low"}</span>
              <span>Progress trend: {family.id === "family-demo-1" ? "improving" : "watch closely"}</span>
              <span>Next review date: {family.id === "family-demo-1" ? "2026-05-20" : "2026-05-21"}</span>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Family Access Scope">
        <MetricRow label="Route" value={path} />
        <MetricRow label="Scope" value="Only consented and assigned families are shown." />
      </Panel>
    </section>
  );
}

function TherapistCasesAdminScreen() {
  return (
    <section className="stack">
      <section className="grid two">
        {therapistSessions.map((session) => (
          <Panel title={`${session.familyName} · ${session.situation}`} key={session.id}>
            <MetricRow label="Active case" value={session.status === "pending_review" ? "Yes" : "Open"} />
            <MetricRow label="Situation focus" value={session.situation} />
            <MetricRow label="Last session" value={session.date} />
            <MetricRow label="Therapist notes" value="Cached professional note available" />
            <MetricRow label="Parent practice assigned" value="Validation / boundary practice" />
            <MetricRow label="Child practice assigned" value="Feeling sentence practice" />
          </Panel>
        ))}
      </section>
    </section>
  );
}

function TherapistSessionReviewAdminScreen({ path }: { path: string }) {
  const sessionId = path.split("/").at(-1) ?? "session-002";
  const review = getTherapistSessionReview(sessionId === "session-review" ? "session-002" : sessionId, "user_therapist_1");

  return (
    <section className="stack">
      <p className="review-banner">AI-generated observations require professional judgement.</p>
      <section className="grid two">
        <Panel title="Session Review">
          <MetricRow label="Family" value={review.session.familyName} />
          <MetricRow label="Situation" value={review.session.situation} />
          <MetricRow label="Risk" value={review.session.riskLevel} />
          <MetricRow label="No AI diagnosis" value="Displayed" />
        </Panel>
        <Panel title="Professional Summary">
          <p>{review.cachedProfessionalSummary}</p>
          <p className="muted">Loaded from cached analysis. Gemini should not run on page load.</p>
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Transcript Timeline">
          <div className="timeline">
            {review.transcriptTimeline.map((turn) => (
              <article key={`${turn.time}-${turn.text}`}>
                <strong>{turn.time} · {turn.speaker}</strong>
                <p>{turn.text}</p>
                <span>{turn.emotionalSignal}</span>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Conversation Graph">
          <div className="graph">
            {review.conversationGraph.map((node) => (
              <div className="graph-node" key={node.label}>
                <span>{node.label}<br /><small>{node.detectedPattern} · {node.confidence}</small></span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Parent Coaching Signals">
          <ul className="check-list">{review.parentCoachingObservations.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Child Self-Coaching Signals">
          <ul className="check-list">{review.childCopingSignals.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
        <Panel title="Risk Assessment">
          <MetricRow label="Risk flag" value={review.session.riskLevel} />
          <MetricRow label="Blocked normal coaching" value={review.riskFlags.some((flag) => flag.includes("Professional review")) ? "Yes" : "No"} />
        </Panel>
        <Panel title="Therapist Notes">
          <ProfessionalNoteForm />
        </Panel>
      </section>
    </section>
  );
}

function TherapistRiskQueueScreen() {
  const riskSessions = therapistSessions.filter((session) => session.riskLevel === "high" || session.riskLevel === "critical");

  return (
    <section className="stack">
      <Panel title="Risk Queue">
        <div className="grid two">
          {riskSessions.map((session) => (
            <article className="mini-card" key={session.id}>
              <strong>{session.familyName} · {session.situation}</strong>
              <span>Detected risk category: professional review</span>
              <span>Confidence: high</span>
              <span>Blocked normal coaching: yes</span>
              <span>Review action: escalate to professional judgement</span>
              <span>Escalation note: cached safety guidance only, no AI diagnosis.</span>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function TherapistPracticeLibraryScreen() {
  return (
    <section className="stack">
      <Panel title="Practice Library">
        <div className="grid two">
          {therapistPracticeTemplates.map((template) => (
            <article className="mini-card" key={template.id}>
              <strong>{template.title}</strong>
              <span>{template.description}</span>
              <span>Target: {template.intendedFor}</span>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function TherapistProgressReportsScreen() {
  const report = getTherapistHome();
  return (
    <section className="stack">
      <section className="grid three">
        <Panel title="Escalation Trend">
          <TrendBars values={[44, 38, 31, 28]} suffix="%" />
        </Panel>
        <Panel title="Repair Score Trend">
          <TrendBars values={[52, 60, 66, 74]} suffix="/100" />
        </Panel>
        <Panel title="Parent Validation Trend">
          <TrendBars values={[48, 55, 61, 68]} suffix="/100" />
        </Panel>
        <Panel title="Child Clarity Trend">
          <TrendBars values={[41, 48, 56, 63]} suffix="/100" />
        </Panel>
      </section>
      <Panel title="Trigger Frequency">
        <div className="tag-row">
          {["homework start", "screen-time ending", "after-school transition"].map((trigger) => <span key={trigger}>{trigger}</span>)}
        </div>
      </Panel>
      <section className="grid two">
        <Panel title="Professional Observations">
          <ul className="check-list">
            <li>Validation is increasing before correction.</li>
            <li>Repair attempts appear earlier in the conversation.</li>
            <li>High-risk items still need professional judgement.</li>
          </ul>
        </Panel>
        <Panel title="Export Summary">
          <button className="secondary-action" type="button" onClick={() => {
            const summary = createExportSummary(report.recentSessions[0]?.id ?? "session-001");
            const text = `Progress Report\nGenerated: ${summary.generatedAt}\nSession: ${summary.sessionId}\nSituation: ${summary.situation}\n\nObserved Patterns:\n${summary.observedPatterns.join("\n")}\n\nCoaching Suggestions:\n${summary.coachingSuggestions.join("\n")}\n\nPractice Plan:\n${summary.practicePlan.join("\n")}\n\n${summary.disclaimer}`;
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `progress-report-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url);
          }}>Export summary</button>
          <p className="muted">{createExportSummary(report.recentSessions[0]?.id ?? "session-001").disclaimer}</p>
        </Panel>
      </section>
    </section>
  );
}

function TherapistNotesTemplateScreen() {
  return (
    <section className="stack">
      <Panel title="Notes Templates">
        <div className="grid two">
          {therapistNoteTemplates.map((template) => (
            <article className="mini-card" key={template.id}>
              <strong>{template.title}</strong>
              <span>{template.body}</span>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function PlatformAdminScreen({ path, role }: { path: string; role: AppRole }) {
  const section = path.split("/").at(-1) ?? "admin";
  const handledSections = ["languages", "roles", "prompts", "safety-rules", "privacy", "compliance", "infrastructure", "feature-flags", "audit-logs", "users", "families", "therapists"];
  return (
    <section className="stack">
      <AdminRouteGrid title="Platform Admin Routes" routes={platformAdminRoutes} />
      {path === "/admin" ? <AdminHomeScreen /> : null}
      {section === "users" ? <AdminUsersModule role={role} /> : null}
      {section === "families" ? <AdminFamiliesModule role={role} /> : null}
      {section === "therapists" ? <AdminTherapistsModule role={role} /> : null}
      {section === "languages" ? <LanguageAdminModule role={role} /> : null}
      {section === "roles" ? <RoleAdminModule role={role} /> : null}
      {section === "prompts" ? <PromptAdminModule role={role} /> : null}
      {section === "safety-rules" ? <SafetyRulesAdminModule role={role} /> : null}
      {section === "privacy" || section === "compliance" ? <PrivacyComplianceAdminModule path={path} role={role} /> : null}
      {section === "infrastructure" ? <InfrastructureAdminModule /> : null}
      {section === "feature-flags" ? <FeatureFlagsAdminModule role={role} /> : null}
      {section === "audit-logs" ? <AuditLogsAdminModule role={role} /> : null}
      {path !== "/admin" && !handledSections.includes(section) ? (
        <Panel title="Admin Overview">
          <MetricRow label="Current section" value={section.replaceAll("-", " ")} />
          <MetricRow label="Firestore" value="MVP primary data store. No Redis by default." />
          <MetricRow label="Redis/Memorystore" value="Disabled unless ENABLE_REDIS=true" />
          <MetricRow label="Raw audio" value="Not stored. STORE_RAW_AUDIO=false enforced." />
        </Panel>
      ) : null}
    </section>
  );
}

function AdminHomeScreen() {
  const { platformStatus, usage, privacy, safety } = adminDashboardMock;

  return (
    <section className="stack">
      <section className="grid four">
        {platformStatus.map((service) => (
          <ServiceStatusCard key={service.label} label={service.label} status={service.status} detail={service.detail} />
        ))}
      </section>
      <section className="grid three">
        <Panel title="Today's Usage">
          <section className="admin-metric-grid">
            <AdminMetricCard label="Sessions created today" value={usage.sessionsCreatedToday} />
            <AdminMetricCard label="Transcript-only sessions" value={usage.transcriptOnlySessions} />
            <AdminMetricCard label="Live audio sessions" value={usage.liveAudioSessions} />
            <AdminMetricCard label="Transient audio uploads" value={usage.transientAudioUploads} />
            <AdminMetricCard label="STT minutes processed" value={usage.sttMinutesProcessed} />
            <AdminMetricCard label="Gemini calls" value={usage.geminiCalls} />
            <AdminMetricCard label="Cached AI results" value={usage.cachedAiResults} />
            <AdminMetricCard label="High-risk sessions" value={usage.highRiskSessions} tone="warning" />
            <AdminMetricCard label="Therapist reviews pending" value={usage.therapistReviewsPending} tone="warning" />
          </section>
        </Panel>
        <PrivacyHealthCard />
        <SafetyHealthCard />
      </section>
      <Panel title="Quick Actions">
        <section className="grid three">
          <AdminQuickActionCard title="Open Cost Admin" path="/admin/cost" />
          <AdminQuickActionCard title="Open Infrastructure Admin" path="/admin/infrastructure" />
          <AdminQuickActionCard title="Review Risk Queue" path="/therapist/admin/risk-queue" />
          <AdminQuickActionCard title="Manage Languages" path="/admin/languages" />
          <AdminQuickActionCard title="Manage Safety Rules" path="/admin/safety-rules" />
          <AdminQuickActionCard title="Review Consent Templates" path="/admin/privacy" />
        </section>
      </Panel>
    </section>
  );
}

function AdminMetricCard({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "warning" | "critical" }) {
  return (
    <article className={`admin-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ServiceStatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <article className={`service-status-card ${status}`}>
      <span>{label}</span>
      <strong>{status}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PrivacyHealthCard() {
  const { privacy } = adminDashboardMock;
  return (
    <Panel title="Privacy Health">
      <MetricRow label="Raw audio stored" value={String(privacy.rawAudioStored)} />
      <MetricRow label="Audio persisted" value={privacy.audioPersisted ? "true" : "false"} />
      <MetricRow label="Pending deletion requests" value={String(privacy.pendingDeletionRequests)} />
      <MetricRow label="Consent acceptance rate" value={privacy.consentAcceptanceRate} />
      <MetricRow label="Therapist-sharing consent count" value={String(privacy.therapistSharingConsentCount)} />
      <MetricRow label="Audit events today" value={String(privacy.auditEventsToday)} />
    </Panel>
  );
}

function SafetyHealthCard() {
  const { safety } = adminDashboardMock;
  return (
    <Panel title="Safety Health">
      <MetricRow label="Critical risk sessions" value={String(safety.criticalRiskSessions)} />
      <MetricRow label="High-risk sessions" value={String(safety.highRiskSessions)} />
      <MetricRow label="Safety rules enabled" value={String(safety.safetyRulesEnabled)} />
      <MetricRow label="Sessions blocked from normal coaching" value={String(safety.blockedFromNormalCoaching)} />
      <p className="muted">High-risk content routes to professional review guidance and does not show normal coaching as the primary result.</p>
    </Panel>
  );
}

function AdminQuickActionCard({ title, path }: { title: string; path: string }) {
  return (
    <a className="admin-quick-action-card" href={path}>
      <strong>{title}</strong>
      <span>{path}</span>
    </a>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = status === "active" || status === "all_granted" || status === "healthy"
    ? "green"
    : status === "partial" || status === "pending" || status === "medium"
      ? "yellow"
      : "red";
  return <span className={`status-chip status-${tone}`}>{status}</span>;
}

function AdminUsersModule({ role }: { role: AppRole }) {
  const canEdit = role === "super_admin";
  const [users, setUsers] = useState<UserAdminRecord[]>(adminUsersDemo);
  const [breakGlassReason, setBreakGlassReason] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const adminHeaders = { "x-user-id": "user_super_admin_1", "x-user-role": role };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ users: UserAdminRecord[] }>("/api/admin/users", { headers: adminHeaders });
        if (!cancelled) { setUsers(data.users.length > 0 ? data.users : adminUsersDemo); setLoadError(null); }
      } catch { if (!cancelled) setLoadError("Could not load users from server — showing demo data."); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function suspendUser(id: string) {
    if (!canEdit) return;
    try {
      await apiJson(`/api/admin/users/${id}/suspend`, { method: "POST", headers: adminHeaders });
      setUsers((current) => current.map((u) => u.id === id ? { ...u, status: "suspended" as const } : u));
    } catch { setLoadError("Could not suspend user."); }
  }

  async function activateUser(id: string) {
    if (!canEdit) return;
    try {
      await apiJson(`/api/admin/users/${id}/suspend`, { method: "DELETE", headers: adminHeaders });
    } catch {}
    setUsers((current) => current.map((u) => u.id === id ? { ...u, status: "active" as const } : u));
  }

  const activeCount = users.filter((u) => u.status === "active").length;
  const mfaEnabledCount = users.filter((u) => u.mfaEnabled).length;

  return (
    <section className="stack">
      {loadError ? <div className="warning">{loadError}</div> : null}
      <section className="grid three">
        <Panel title="User Summary">
          <MetricRow label="Total users" value={String(users.length)} />
          <MetricRow label="Active" value={String(activeCount)} />
          <MetricRow label="MFA enabled" value={`${mfaEnabledCount} / ${users.length}`} />
          <MetricRow label="Firestore collection" value="admin_users" />
        </Panel>
        <Panel title="Break-Glass Access">
          <p className="muted">Super admin accessing sensitive user records requires a stated reason. This creates an audit event.</p>
          <div className="form-grid">
            <label>Reason for access
              <textarea
                value={breakGlassReason}
                onChange={(e) => setBreakGlassReason(e.target.value)}
                placeholder="Required for accessing sensitive user data."
                disabled={!canEdit}
              />
            </label>
          </div>
          <MetricRow label="Audit event" value={breakGlassReason.trim() ? "Will be created on action" : "Not yet stated"} />
        </Panel>
        <Panel title="RBAC Policy">
          <MetricRow label="super_admin" value="Full platform access" />
          <MetricRow label="clinical_admin" value="Risk queue and clinical config" />
          <MetricRow label="therapist" value="Assigned consented families only" />
          <MetricRow label="support_staff" value="No transcripts or coaching data" />
          <MetricRow label="auditor" value="Audit logs read-only" />
          <MetricRow label="parent" value="Own family only" />
          <MetricRow label="child" value="Child-friendly pages only" />
        </Panel>
      </section>
      <Panel title="User Accounts">
        <div className="admin-table">
          <div className="admin-table-header">
            <span>User</span><span>Role</span><span>Status</span><span>MFA</span><span>Last Active</span>{canEdit && <span>Actions</span>}
          </div>
          {users.map((user) => (
            <div className="admin-table-row" key={user.id}>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
              <span><StatusChip status={user.role} /></span>
              <span><StatusChip status={user.status} /></span>
              <span>{user.mfaEnabled ? "Enabled" : "Disabled"}</span>
              <span>{user.lastActiveAt}</span>
              {canEdit && (
                <span className="action-cell">
                  {user.status === "active"
                    ? <button className="secondary-action" type="button" onClick={() => suspendUser(user.id)}>Suspend</button>
                    : <button className="secondary-action" type="button" onClick={() => activateUser(user.id)}>Activate</button>}
                </span>
              )}
            </div>
          ))}
        </div>
        {!canEdit && <p className="muted">Role changes and suspension require super_admin access.</p>}
      </Panel>
    </section>
  );
}

function AdminFamiliesModule({ role }: { role: AppRole }) {
  const canView = role === "super_admin" || role === "clinical_admin";
  const [families, setFamilies] = useState<FamilyAdminRecord[]>(adminFamiliesDemo);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ families: FamilyAdminRecord[] }>("/api/admin/families", { headers: { "x-user-id": "user_super_admin_1", "x-user-role": role } });
        if (!cancelled) { setFamilies(data.families.length > 0 ? data.families : adminFamiliesDemo); setLoadError(null); }
      } catch { if (!cancelled) setLoadError("Could not load families — showing demo data."); }
    })();
    return () => { cancelled = true; };
  }, [canView]);

  const noAudioCount = families.filter((f) => f.audioStoredCount === 0).length;
  const consentedCount = families.filter((f) => f.consentStatus === "all_granted").length;
  const highRiskCount = families.filter((f) => f.riskLevel === "high" || f.riskLevel === "critical").length;

  if (!canView) {
    return (
      <Panel title="Access Restricted">
        <MetricRow label="Required role" value="super_admin or clinical_admin" />
        <p className="muted">Family records are governed under RBAC. Support staff and auditors cannot view family records.</p>
      </Panel>
    );
  }

  return (
    <section className="stack">
      {loadError ? <div className="warning">{loadError}</div> : null}
      <section className="grid four">
        <Panel title="Families">
          <MetricRow label="Total families" value={String(families.length)} />
          <MetricRow label="All consent granted" value={String(consentedCount)} />
          <MetricRow label="High / critical risk" value={String(highRiskCount)} />
          <MetricRow label="Firestore collection" value="admin_families" />
        </Panel>
        <Panel title="Privacy Compliance">
          <MetricRow label="Families with zero audio stored" value={`${noAudioCount} / ${families.length}`} />
          <MetricRow label="STORE_RAW_AUDIO" value="false (enforced)" />
          <MetricRow label="Audio stored count across all families" value={String(families.reduce((sum, f) => sum + f.audioStoredCount, 0))} />
        </Panel>
        <Panel title="Therapist Assignment">
          <MetricRow label="Assigned families" value={String(families.filter((f) => f.therapistAssigned).length)} />
          <MetricRow label="Unassigned families" value={String(families.filter((f) => !f.therapistAssigned).length)} />
          <MetricRow label="Therapist access scope" value="Consent-only" />
        </Panel>
        <Panel title="Consent Status">
          <MetricRow label="All consent granted" value={String(consentedCount)} />
          <MetricRow label="Partial consent" value={String(families.filter((f) => f.consentStatus === "partial").length)} />
          <MetricRow label="No consent" value={String(families.filter((f) => f.consentStatus === "none").length)} />
        </Panel>
      </section>
      <Panel title="Family Records">
        <div className="admin-table">
          <div className="admin-table-header">
            <span>Family</span><span>Sessions</span><span>Consent</span><span>Risk</span><span>Audio Stored</span><span>Therapist</span><span>Last Session</span>
          </div>
          {families.map((family) => (
            <div className="admin-table-row" key={family.id}>
              <span>
                <strong>{family.displayName}</strong>
                <small>{family.memberCount} members · {family.childCount} children</small>
              </span>
              <span>{family.sessionCount}</span>
              <span><StatusChip status={family.consentStatus} /></span>
              <span><StatusChip status={family.riskLevel} /></span>
              <span>{family.audioStoredCount === 0 ? "None (compliant)" : String(family.audioStoredCount)}</span>
              <span>{family.therapistAssigned ? "Assigned" : "Unassigned"}</span>
              <span>{family.lastSessionAt}</span>
            </div>
          ))}
        </div>
        <p className="muted">Support staff cannot view this table. Transcripts and coaching data are blocked for non-clinical roles.</p>
      </Panel>
    </section>
  );
}

function AdminTherapistsModule({ role }: { role: AppRole }) {
  const canEdit = role === "super_admin";
  const [therapists, setTherapists] = useState<TherapistAdminRecord[]>(adminTherapistsDemo);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ therapists: TherapistAdminRecord[] }>("/api/admin/therapists", { headers: { "x-user-id": "user_super_admin_1", "x-user-role": role } });
        if (!cancelled) { setTherapists(data.therapists.length > 0 ? data.therapists : adminTherapistsDemo); setLoadError(null); }
      } catch { if (!cancelled) setLoadError("Could not load therapists — showing demo data."); }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeCount = therapists.filter((t) => t.status === "active").length;
  const verifiedCount = therapists.filter((t) => t.licenseVerified).length;
  const totalPending = therapists.reduce((sum, t) => sum + t.pendingReviewCount, 0);

  return (
    <section className="stack">
      {loadError ? <div className="warning">{loadError}</div> : null}
      <section className="grid three">
        <Panel title="Therapist Summary">
          <MetricRow label="Total therapists" value={String(therapists.length)} />
          <MetricRow label="Active" value={String(activeCount)} />
          <MetricRow label="License verified" value={`${verifiedCount} / ${therapists.length}`} />
          <MetricRow label="Pending reviews (total)" value={String(totalPending)} />
          <MetricRow label="Firestore collection" value="admin_therapists" />
        </Panel>
        <Panel title="Consent Scope Policy">
          <p className="muted">Therapists see only consented, assigned families. Consent-scope is enforced at the data access layer. No therapist can view unassigned families regardless of role.</p>
          <MetricRow label="Consent-only access" value="Enforced for all" />
          <MetricRow label="Break-glass required" value="To access unassigned family" />
          <MetricRow label="Audit logged" value="All therapist session views" />
        </Panel>
        <Panel title="Assignment Rules">
          <MetricRow label="Assignment requires" value="Parent therapist_share consent" />
          <MetricRow label="Revoked consent" value="Immediately removes access" />
          <MetricRow label="Clinical admin oversight" value="Can view all assigned cases" />
        </Panel>
      </section>
      <Panel title="Therapist Accounts">
        <div className="admin-table">
          <div className="admin-table-header">
            <span>Therapist</span><span>Role</span><span>Status</span><span>License</span><span>Assigned Families</span><span>Active Cases</span><span>Pending Reviews</span><span>Last Active</span>
          </div>
          {therapists.map((therapist) => (
            <div className="admin-table-row" key={therapist.id}>
              <span>
                <strong>{therapist.displayName}</strong>
                <small>{therapist.email}</small>
              </span>
              <span><StatusChip status={therapist.role} /></span>
              <span><StatusChip status={therapist.status} /></span>
              <span>{therapist.licenseVerified ? "Verified" : "Pending"}</span>
              <span>{therapist.assignedFamilyCount}</span>
              <span>{therapist.activeCaseCount}</span>
              <span className={therapist.pendingReviewCount > 0 ? "metric-warning" : ""}>{therapist.pendingReviewCount}</span>
              <span>{therapist.lastActivityAt}</span>
            </div>
          ))}
        </div>
        {!canEdit && <p className="muted">Adding or removing therapist assignments requires super_admin access.</p>}
      </Panel>
    </section>
  );
}

function AdminRouteGrid({ title, routes }: { title: string; routes: string[] }) {
  return (
    <Panel title={title}>
      <div className="tag-row">{routes.map((route) => <a className="button-link" href={route} key={route}>{route}</a>)}</div>
    </Panel>
  );
}

type LanguageReviewStatus = "draft" | "needs clinical review" | "approved" | "retired";
type LanguagePhraseCategory =
  | "parent escalation phrases"
  | "child reaction phrases"
  | "repair phrases"
  | "safety phrases"
  | "therapist terms"
  | "child-friendly emotion words";

type LanguageDictionaryEntry = {
  id: string;
  phrase: string;
  language: string;
  category: LanguagePhraseCategory;
  severity: "low" | "medium" | "high";
  meaningInEnglish: string;
  recommendedReplacement: string;
  reviewedByClinicalAdmin: boolean;
  confidence: "low" | "medium" | "high";
  reviewStatus: LanguageReviewStatus;
  lastUpdated: string;
};

type LanguageRow = {
  code: string;
  displayName: string;
  enabled: boolean;
  sttSupportEnabled: boolean;
  coachingOutputEnabled: boolean;
  childFriendlyOutputEnabled: boolean;
  therapistTerminologyReviewed: boolean;
  lastReviewedBy: string;
  lastUpdated: string;
  reviewStatus: LanguageReviewStatus;
};

const languageAdminRows: LanguageRow[] = [
  {
    code: "en-IN",
    displayName: "English India",
    enabled: true,
    sttSupportEnabled: true,
    coachingOutputEnabled: true,
    childFriendlyOutputEnabled: true,
    therapistTerminologyReviewed: true,
    lastReviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    reviewStatus: "approved",
  },
  {
    code: "hi-IN",
    displayName: "Hindi",
    enabled: true,
    sttSupportEnabled: true,
    coachingOutputEnabled: true,
    childFriendlyOutputEnabled: true,
    therapistTerminologyReviewed: true,
    lastReviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    reviewStatus: "approved",
  },
  {
    code: "te-IN",
    displayName: "Telugu",
    enabled: true,
    sttSupportEnabled: true,
    coachingOutputEnabled: true,
    childFriendlyOutputEnabled: true,
    therapistTerminologyReviewed: true,
    lastReviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    reviewStatus: "approved",
  },
  {
    code: "ta-IN",
    displayName: "Tamil",
    enabled: true,
    sttSupportEnabled: true,
    coachingOutputEnabled: true,
    childFriendlyOutputEnabled: true,
    therapistTerminologyReviewed: true,
    lastReviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    reviewStatus: "approved",
  },
];

const languagePhraseLibrary: Record<LanguagePhraseCategory, LanguageDictionaryEntry[]> = {
  "parent escalation phrases": [
    {
      id: "parent-escalation-1",
      phrase: "You never listen.",
      language: "en-IN",
      category: "parent escalation phrases",
      severity: "high",
      meaningInEnglish: "Global criticism that escalates conflict.",
      recommendedReplacement: "I need you to listen for one minute.",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
    {
      id: "parent-escalation-2",
      phrase: "Tum kabhi nahi sunte.",
      language: "hi-IN",
      category: "parent escalation phrases",
      severity: "high",
      meaningInEnglish: "You never listen.",
      recommendedReplacement: "Mujhe chahiye ki aap ek minute suniye.",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
  ],
  "child reaction phrases": [
    {
      id: "child-reaction-1",
      phrase: "I hate homework.",
      language: "en-IN",
      category: "child reaction phrases",
      severity: "medium",
      meaningInEnglish: "Child is frustrated and overwhelmed.",
      recommendedReplacement: "I feel frustrated because this is hard.",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
    {
      id: "child-reaction-2",
      phrase: "Mujhe ye pasand nahi.",
      language: "hi-IN",
      category: "child reaction phrases",
      severity: "medium",
      meaningInEnglish: "I do not like this.",
      recommendedReplacement: "Mujhe frustration ho rahi hai.",
      reviewedByClinicalAdmin: true,
      confidence: "medium",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
  ],
  "repair phrases": [
    {
      id: "repair-1",
      phrase: "I want to try again.",
      language: "en-IN",
      category: "repair phrases",
      severity: "low",
      meaningInEnglish: "Signals willingness to repair after conflict.",
      recommendedReplacement: "Can we restart calmly?",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
  ],
  "safety phrases": [
    {
      id: "safety-1",
      phrase: "I want to hurt myself.",
      language: "en-IN",
      category: "safety phrases",
      severity: "high",
      meaningInEnglish: "Potential self-harm disclosure.",
      recommendedReplacement: "Immediate adult safety escalation and professional review.",
      reviewedByClinicalAdmin: false,
      confidence: "high",
      reviewStatus: "needs clinical review",
      lastUpdated: "2026-05-18",
    },
    {
      id: "safety-2",
      phrase: "Main khud ko nuksan pahunchana chahta/chahti hoon.",
      language: "hi-IN",
      category: "safety phrases",
      severity: "high",
      meaningInEnglish: "I want to hurt myself.",
      recommendedReplacement: "Immediate adult safety escalation and professional review.",
      reviewedByClinicalAdmin: false,
      confidence: "high",
      reviewStatus: "needs clinical review",
      lastUpdated: "2026-05-18",
    },
  ],
  "therapist terms": [
    {
      id: "therapist-1",
      phrase: "consented family",
      language: "en-IN",
      category: "therapist terms",
      severity: "low",
      meaningInEnglish: "Family with active sharing consent.",
      recommendedReplacement: "consented family",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
  ],
  "child-friendly emotion words": [
    {
      id: "child-emotion-1",
      phrase: "frustrated",
      language: "en-IN",
      category: "child-friendly emotion words",
      severity: "low",
      meaningInEnglish: "The child feels blocked or stuck.",
      recommendedReplacement: "frustrated",
      reviewedByClinicalAdmin: true,
      confidence: "high",
      reviewStatus: "approved",
      lastUpdated: "2026-05-18",
    },
  ],
};

const languagePreviewResponses: Record<string, string> = {
  "en-IN": "I hear that this is hard. Let us pause and choose one small next step.",
  "hi-IN": "Mujhe samajh aa raha hai ki yeh mushkil hai. Chaliye rukkar ek chhota next step chunte hain.",
  "te-IN": "Idi kashtam ani nenu artham chesukuntunnanu. Chinna next step ni kalisi chuddham.",
  "ta-IN": "Idhu kashtam enru naan purindhukolgiren. Oru chinna aduttha adiyai serndhu theervu seivom.",
};

function LanguageAdminModule({ role }: { role: AppRole }) {
  const canEdit = role === "super_admin" || role === "clinical_admin";
  const canSuggest = canEdit || role === "therapist";
  const [activeCategory, setActiveCategory] = useState<LanguagePhraseCategory>("parent escalation phrases");
  const [previewLanguage, setPreviewLanguage] = useState("hi-IN");
  const [sampleTranscriptLine, setSampleTranscriptLine] = useState("Tum kabhi nahi sunte.");
  const [selectedPhrase, setSelectedPhrase] = useState<LanguageDictionaryEntry>(languagePhraseLibrary[activeCategory][0]);
  const workflowCounts = {
    draft: 6,
    "needs clinical review": 3,
    approved: 24,
    retired: 2,
  };

  const [editedPhrase, setEditedPhrase] = useState<LanguageDictionaryEntry>({ ...selectedPhrase });
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [phraseSaveError, setPhraseSaveError] = useState<string | null>(null);

  useEffect(() => {
    const next = languagePhraseLibrary[activeCategory][0];
    setSelectedPhrase(next);
    setEditedPhrase({ ...next });
    setPhraseSaved(false);
  }, [activeCategory]);

  useEffect(() => {
    setEditedPhrase({ ...selectedPhrase });
    setPhraseSaved(false);
  }, [selectedPhrase.id]);

  function updateEdit<K extends keyof LanguageDictionaryEntry>(field: K, value: LanguageDictionaryEntry[K]) {
    setEditedPhrase((prev) => ({ ...prev, [field]: value }));
    setPhraseSaved(false);
  }

  async function saveSuggestion() {
    setPhraseSaveError(null);
    try {
      await apiJson("/api/admin/language-phrases", {
        method: "POST",
        headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
        body: JSON.stringify({ ...editedPhrase, reviewStatus: "draft" }),
      });
    } catch {}
    setPhraseSaved(true);
  }

  async function publishPhrase() {
    setPhraseSaveError(null);
    try {
      await apiJson("/api/admin/language-phrases", {
        method: "POST",
        headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
        body: JSON.stringify({ ...editedPhrase, reviewStatus: "approved" }),
      });
    } catch {}
    setEditedPhrase((prev) => ({ ...prev, reviewStatus: "approved" }));
    setPhraseSaved(true);
  }

  const selectedLibrary = languagePhraseLibrary[activeCategory];
  const preview = buildLanguagePreview(sampleTranscriptLine, previewLanguage);

  return (
    <section className="stack language-admin">
      <section className="grid two">
        <Panel title="Language List">
          <p className="muted">Language-level enablement becomes active only after clinical review.</p>
          <div className="language-list">
            <div className="language-list-header">
              <span>Code</span>
              <span>Display</span>
              <span>Enabled</span>
              <span>STT</span>
              <span>Coaching</span>
              <span>Child</span>
              <span>Therapist terms</span>
              <span>Last reviewed by</span>
              <span>Last updated</span>
            </div>
            {languageAdminRows.map((language) => (
              <article className="language-list-row" key={language.code}>
                <span>{language.code}</span>
                <span>{language.displayName}</span>
                <span>
                  <input type="checkbox" checked={language.enabled} disabled={!canEdit || language.reviewStatus !== "approved"} readOnly />
                </span>
                <span>{boolChip(language.sttSupportEnabled)}</span>
                <span>{boolChip(language.coachingOutputEnabled)}</span>
                <span>{boolChip(language.childFriendlyOutputEnabled)}</span>
                <span>{boolChip(language.therapistTerminologyReviewed)}</span>
                <span>{language.lastReviewedBy}</span>
                <span>{language.lastUpdated}</span>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Review Workflow">
          <div className="workflow-grid">
            <article className="workflow-card draft">
              <strong>Draft</strong>
              <span>{workflowCounts.draft}</span>
            </article>
            <article className="workflow-card review">
              <strong>Needs clinical review</strong>
              <span>{workflowCounts["needs clinical review"]}</span>
            </article>
            <article className="workflow-card approved">
              <strong>Approved</strong>
              <span>{workflowCounts.approved}</span>
            </article>
            <article className="workflow-card retired">
              <strong>Retired</strong>
              <span>{workflowCounts.retired}</span>
            </article>
          </div>
          <div className="review-policy">
            <strong>Safety policy</strong>
            <p>Do not allow unreviewed high-risk safety phrases to be used in production.</p>
            <p>Language-level enablement is locked until a clinical admin approves the content.</p>
          </div>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Phrase Dictionaries">
          <div className="tabs">
            {Object.keys(languagePhraseLibrary).map((category) => (
              <button
                className={activeCategory === category ? "active" : ""}
                key={category}
                onClick={() => setActiveCategory(category as LanguagePhraseCategory)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
          <div className="phrase-library">
            {selectedLibrary.map((entry) => (
              <button className="phrase-library-row" key={entry.id} onClick={() => setSelectedPhrase(entry)} type="button">
                <span>{entry.phrase}</span>
                <small>{entry.language} · {entry.severity} · {entry.reviewStatus}</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Add / Edit Phrase">
          {phraseSaved ? <div className="success-banner">Phrase saved.</div> : null}
          {phraseSaveError ? <div className="warning">{phraseSaveError}</div> : null}
          <div className="form-grid">
            <label>Phrase<input value={editedPhrase.phrase} onChange={(e) => updateEdit("phrase", e.target.value)} disabled={!canSuggest} /></label>
            <label>Language
              <select value={editedPhrase.language} onChange={(e) => updateEdit("language", e.target.value)} disabled={!canSuggest}>
                {languageAdminRows.map((language) => <option key={language.code} value={language.code}>{language.code} · {language.displayName}</option>)}
              </select>
            </label>
            <label>Category
              <select value={editedPhrase.category} onChange={(e) => updateEdit("category", e.target.value as LanguagePhraseCategory)} disabled={!canSuggest}>
                {Object.keys(languagePhraseLibrary).map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>Severity
              <select value={editedPhrase.severity} onChange={(e) => updateEdit("severity", e.target.value as LanguageDictionaryEntry["severity"])} disabled={!canSuggest}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label>Meaning in English<textarea value={editedPhrase.meaningInEnglish} onChange={(e) => updateEdit("meaningInEnglish", e.target.value)} disabled={!canSuggest} /></label>
            <label>Recommended replacement<textarea value={editedPhrase.recommendedReplacement} onChange={(e) => updateEdit("recommendedReplacement", e.target.value)} disabled={!canSuggest} /></label>
            <label className="toggle-row-inline">
              <span>reviewedByClinicalAdmin</span>
              <input type="checkbox" checked={editedPhrase.reviewedByClinicalAdmin} onChange={(e) => updateEdit("reviewedByClinicalAdmin", e.target.checked)} disabled={!canEdit} />
            </label>
            <label>Confidence
              <select value={editedPhrase.confidence} onChange={(e) => updateEdit("confidence", e.target.value as LanguageDictionaryEntry["confidence"])} disabled={!canSuggest}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label>Review status
              <select value={editedPhrase.reviewStatus} onChange={(e) => updateEdit("reviewStatus", e.target.value as LanguageReviewStatus)} disabled={!canEdit}>
                <option value="draft">draft</option>
                <option value="needs clinical review">needs clinical review</option>
                <option value="approved">approved</option>
                <option value="retired">retired</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!canSuggest} onClick={saveSuggestion}>
              Save suggestion
            </button>
            <button className="secondary-action" type="button" disabled={!canEdit || (editedPhrase.category === "safety phrases" && editedPhrase.reviewStatus !== "approved")} onClick={publishPhrase}>
              Publish phrase
            </button>
          </div>
          {!canEdit ? <p className="muted">Therapists can suggest phrases here, but only clinical admins and super admins can publish.</p> : null}
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Localisation Preview">
          <div className="form-grid">
            <label>Sample transcript line<textarea value={sampleTranscriptLine} onChange={(event) => setSampleTranscriptLine(event.target.value)} /></label>
            <label>Preview language
              <select value={previewLanguage} onChange={(event) => setPreviewLanguage(event.target.value)}>
                {languageAdminRows.map((language) => <option key={language.code} value={language.code}>{language.displayName}</option>)}
              </select>
            </label>
          </div>
        </Panel>
        <Panel title="Preview Output">
          <MetricRow label="Detected pattern" value={preview.pattern} />
          <MetricRow label="English explanation" value={preview.explanation} />
          <MetricRow label="Coaching response" value={preview.response} />
        </Panel>
      </section>
    </section>
  );
}

function boolChip(value: boolean): string {
  return value ? "Yes" : "No";
}

function buildLanguagePreview(sampleTranscriptLine: string, languageCode: string): { pattern: string; explanation: string; response: string } {
  const lowered = sampleTranscriptLine.toLowerCase();
  if (lowered.includes("never") || lowered.includes("kabhi") || lowered.includes("eppudu")) {
    return {
      pattern: "parent escalation",
      explanation: "The line uses global criticism and is likely to escalate the conversation.",
      response: languagePreviewResponses[languageCode] ?? languagePreviewResponses["en-IN"],
    };
  }

  if (lowered.includes("hate") || lowered.includes("nahi") || lowered.includes("kashtam")) {
    return {
      pattern: "child reaction",
      explanation: "The line reads like frustration or rejection rather than a safety issue.",
      response: languagePreviewResponses[languageCode] ?? languagePreviewResponses["en-IN"],
    };
  }

  return {
    pattern: "repair opportunity",
    explanation: "The line appears neutral enough for a calm repair response.",
    response: languagePreviewResponses[languageCode] ?? languagePreviewResponses["en-IN"],
  };
}

type PermissionKey =
  | "view_own_family"
  | "view_assigned_family"
  | "view_transcript"
  | "view_child_profile"
  | "view_parent_analysis"
  | "view_child_analysis"
  | "view_risk_queue"
  | "edit_therapist_note"
  | "assign_practice"
  | "manage_language"
  | "manage_prompt"
  | "manage_safety_rule"
  | "manage_consent_template"
  | "export_data"
  | "delete_data"
  | "break_glass_access"
  | "view_audit_logs"
  | "manage_feature_flags"
  | "view_cost_admin"
  | "edit_cost_limits";

type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  risky?: boolean;
};

type RolePermissionRow = {
  role: string;
  type: "system" | "custom";
  permissions: Record<PermissionKey, boolean>;
  scope: string;
  reviewState: "locked" | "editable" | "super_admin_unlocked";
};

const rolePermissionDefinitions: PermissionDefinition[] = [
  { key: "view_own_family", label: "View own family" },
  { key: "view_assigned_family", label: "View assigned family" },
  { key: "view_transcript", label: "View transcript", risky: true },
  { key: "view_child_profile", label: "View child profile", risky: true },
  { key: "view_parent_analysis", label: "View parent analysis", risky: true },
  { key: "view_child_analysis", label: "View child analysis", risky: true },
  { key: "view_risk_queue", label: "View risk queue", risky: true },
  { key: "edit_therapist_note", label: "Edit therapist note", risky: true },
  { key: "assign_practice", label: "Assign practice", risky: true },
  { key: "manage_language", label: "Manage language", risky: true },
  { key: "manage_prompt", label: "Manage prompt", risky: true },
  { key: "manage_safety_rule", label: "Manage safety rule", risky: true },
  { key: "manage_consent_template", label: "Manage consent template", risky: true },
  { key: "export_data", label: "Export data", risky: true },
  { key: "delete_data", label: "Delete data", risky: true },
  { key: "break_glass_access", label: "Break-glass access", risky: true },
  { key: "view_audit_logs", label: "View audit logs", risky: true },
  { key: "manage_feature_flags", label: "Manage feature flags", risky: true },
  { key: "view_cost_admin", label: "View cost admin", risky: true },
  { key: "edit_cost_limits", label: "Edit cost limits", risky: true },
];

const rolePermissionRows: RolePermissionRow[] = [
  {
    role: "super_admin",
    type: "system",
    scope: "Global override and break-glass approved.",
    reviewState: "locked",
    permissions: {
      view_own_family: true,
      view_assigned_family: true,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: true,
      edit_therapist_note: true,
      assign_practice: true,
      manage_language: true,
      manage_prompt: true,
      manage_safety_rule: true,
      manage_consent_template: true,
      export_data: true,
      delete_data: true,
      break_glass_access: true,
      view_audit_logs: true,
      manage_feature_flags: true,
      view_cost_admin: true,
      edit_cost_limits: true,
    },
  },
  {
    role: "clinical_admin",
    type: "system",
    scope: "Clinical oversight and content review.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: true,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: true,
      edit_therapist_note: true,
      assign_practice: true,
      manage_language: true,
      manage_prompt: true,
      manage_safety_rule: true,
      manage_consent_template: true,
      export_data: true,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: true,
      manage_feature_flags: false,
      view_cost_admin: true,
      edit_cost_limits: false,
    },
  },
  {
    role: "therapist",
    type: "system",
    scope: "Assigned and consented families only.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: true,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: true,
      edit_therapist_note: true,
      assign_practice: true,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: true,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "psychologist",
    type: "system",
    scope: "Assigned and consented families only.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: true,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: true,
      edit_therapist_note: true,
      assign_practice: true,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: true,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "parent",
    type: "system",
    scope: "Own family only.",
    reviewState: "locked",
    permissions: {
      view_own_family: true,
      view_assigned_family: false,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: false,
      edit_therapist_note: false,
      assign_practice: false,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: true,
      delete_data: true,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "child",
    type: "system",
    scope: "Child-friendly views only.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: false,
      view_transcript: false,
      view_child_profile: true,
      view_parent_analysis: false,
      view_child_analysis: true,
      view_risk_queue: false,
      edit_therapist_note: false,
      assign_practice: false,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: false,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "school_counselor",
    type: "system",
    scope: "Scoped assigned-family access only.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: true,
      view_transcript: true,
      view_child_profile: true,
      view_parent_analysis: true,
      view_child_analysis: true,
      view_risk_queue: true,
      edit_therapist_note: true,
      assign_practice: true,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: true,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "support_staff",
    type: "system",
    scope: "Operational support without transcript access.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: false,
      view_transcript: false,
      view_child_profile: false,
      view_parent_analysis: false,
      view_child_analysis: false,
      view_risk_queue: false,
      edit_therapist_note: false,
      assign_practice: false,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: false,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: false,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
  {
    role: "auditor",
    type: "system",
    scope: "Read-only compliance review.",
    reviewState: "locked",
    permissions: {
      view_own_family: false,
      view_assigned_family: false,
      view_transcript: false,
      view_child_profile: false,
      view_parent_analysis: false,
      view_child_analysis: false,
      view_risk_queue: false,
      edit_therapist_note: false,
      assign_practice: false,
      manage_language: false,
      manage_prompt: false,
      manage_safety_rule: false,
      manage_consent_template: false,
      export_data: false,
      delete_data: false,
      break_glass_access: false,
      view_audit_logs: true,
      manage_feature_flags: false,
      view_cost_admin: false,
      edit_cost_limits: false,
    },
  },
];

const initialCustomRoleRow: RolePermissionRow = {
  role: "family_coach_custom",
  type: "custom",
  scope: "Custom role editable by admins.",
  reviewState: "editable",
  permissions: {
    view_own_family: true,
    view_assigned_family: true,
    view_transcript: false,
    view_child_profile: true,
    view_parent_analysis: true,
    view_child_analysis: true,
    view_risk_queue: false,
    edit_therapist_note: false,
    assign_practice: true,
    manage_language: false,
    manage_prompt: false,
    manage_safety_rule: false,
    manage_consent_template: false,
    export_data: false,
    delete_data: false,
    break_glass_access: false,
    view_audit_logs: false,
    manage_feature_flags: false,
    view_cost_admin: false,
    edit_cost_limits: false,
  },
};

type BreakGlassEvent = {
  at: string;
  role: string;
  permission: PermissionKey;
  reason: string;
  expiresAt: string;
};

function RoleAdminModule({ role }: { role: AppRole }) {
  const canView = role === "super_admin" || role === "clinical_admin";
  const canUnlockSystemRoles = role === "super_admin";
  const [unlockSystemRoles, setUnlockSystemRoles] = useState(false);
  const [customRole, setCustomRole] = useState<RolePermissionRow>(initialCustomRoleRow);
  const [breakGlassReason, setBreakGlassReason] = useState("");
  const [breakGlassPermission, setBreakGlassPermission] = useState<PermissionKey>("view_transcript");
  const [breakGlassEvents, setBreakGlassEvents] = useState<BreakGlassEvent[]>([
    {
      at: "2026-05-18 09:10",
      role: "super_admin",
      permission: "break_glass_access",
      reason: "Urgent review of sensitive transcript during incident handling.",
      expiresAt: "2026-05-18 10:10",
    },
  ]);

  const systemUnlockActive = canUnlockSystemRoles && unlockSystemRoles;

  if (!canView) {
    return (
      <Panel title="Role Admin">
        <p className="muted">This area is restricted to clinical admins and super admins.</p>
      </Panel>
    );
  }

  function updateCustomPermission(permission: PermissionKey, checked: boolean) {
    setCustomRole((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permission]: checked,
      },
    }));
  }

  function grantBreakGlassAccess() {
    if (!breakGlassReason.trim()) {
      return;
    }

    setBreakGlassEvents((events) => [
      {
        at: new Date().toISOString().slice(0, 16).replace("T", " "),
        role: role === "super_admin" ? "super_admin" : "clinical_admin",
        permission: breakGlassPermission,
        reason: breakGlassReason.trim(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 16).replace("T", " "),
      },
      ...events,
    ]);
    setBreakGlassReason("");
  }

  return (
    <section className="stack role-admin">
      <Panel title="Security Rules">
        <ul className="check-list">
          <li>support_staff must not access transcripts.</li>
          <li>therapist can access only consented and assigned families.</li>
          <li>parent can access only own family.</li>
          <li>child can access only child-friendly views.</li>
        </ul>
      </Panel>

      <section className="grid two">
        <Panel title="Permission Matrix">
          <div className="role-admin-toolbar">
            <label className="toggle-row-inline">
              <span>
                <strong>Unlock system roles</strong>
                <small>Only super_admin can switch system roles into edit mode.</small>
              </span>
              <input
                checked={systemUnlockActive}
                disabled={!canUnlockSystemRoles}
                onChange={(event) => setUnlockSystemRoles(event.target.checked)}
                type="checkbox"
              />
            </label>
            {!canUnlockSystemRoles ? <p className="muted">System roles are read-only for clinical admins.</p> : null}
          </div>
          <div className="permission-matrix">
            <div className="permission-matrix-header">
              <span>Role</span>
              {rolePermissionDefinitions.map((permission) => (
                <span key={permission.key} className={permission.risky ? "risky-permission" : ""}>
                  {permission.label}
                </span>
              ))}
            </div>
            {rolePermissionRows.map((row) => (
              <article className="permission-matrix-row" key={row.role}>
                <div className="role-cell">
                  <strong>{row.role}</strong>
                  <small>{row.scope}</small>
                  <span className={`status-pill role-status ${row.type}`}>{row.type === "system" ? "System" : "Custom"}</span>
                </div>
                {rolePermissionDefinitions.map((permission) => {
                  const checked = row.permissions[permission.key];
                  const isEditable = row.type === "custom" || systemUnlockActive;
                  const showLocked = row.type === "system" && !systemUnlockActive;
                  return (
                    <label
                      className={permission.risky ? "permission-cell risky" : "permission-cell"}
                      key={`${row.role}-${permission.key}`}
                    >
                      <input checked={checked} disabled={!isEditable} readOnly={showLocked} type="checkbox" />
                      <span>{showLocked ? "Locked" : checked ? "On" : "Off"}</span>
                    </label>
                  );
                })}
              </article>
            ))}
            <article className="permission-matrix-row custom-row">
              <div className="role-cell">
                <strong>{customRole.role}</strong>
                <small>{customRole.scope}</small>
                <span className="status-pill role-status custom">Custom</span>
              </div>
              {rolePermissionDefinitions.map((permission) => (
                <label className={permission.risky ? "permission-cell risky" : "permission-cell"} key={`custom-${permission.key}`}>
                  <input
                    checked={customRole.permissions[permission.key]}
                    onChange={(event) => updateCustomPermission(permission.key, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{customRole.permissions[permission.key] ? "On" : "Off"}</span>
                </label>
              ))}
            </article>
          </div>
          <p className="muted">Risky permissions are highlighted in red because they expose transcripts, sensitive analysis, audit logs, or platform controls.</p>
        </Panel>

        <Panel title="Break-glass Access">
          <div className="break-glass-panel">
            <label>
              Sensitive access reason
              <textarea value={breakGlassReason} onChange={(event) => setBreakGlassReason(event.target.value)} placeholder="Explain why sensitive access is required." />
            </label>
            <label>
              Sensitive permission
              <select value={breakGlassPermission} onChange={(event) => setBreakGlassPermission(event.target.value as PermissionKey)}>
                {rolePermissionDefinitions
                  .filter((permission) => permission.risky)
                  .map((permission) => <option key={permission.key} value={permission.key}>{permission.label}</option>)}
              </select>
            </label>
            <div className="action-row">
              <button className="secondary-action" disabled={!canUnlockSystemRoles} onClick={grantBreakGlassAccess} type="button">
                Grant temporary access
              </button>
              <span className="muted">Access expires automatically after 15 minutes.</span>
            </div>
          </div>
        </Panel>
      </section>

      <Panel title="Audit Events">
        <div className="audit-log">
          {breakGlassEvents.map((event) => (
            <article className="audit-log-row" key={`${event.at}-${event.permission}`}>
              <strong>{event.permission.replaceAll("_", " ")}</strong>
              <span>{event.role}</span>
              <span>{event.reason}</span>
              <span>Expires {event.expiresAt}</span>
            </article>
          ))}
        </div>
        <p className="muted">Any break-glass access should be logged, time limited, and reviewed after use.</p>
      </Panel>
    </section>
  );
}

type PromptCategory =
  | "parent_analysis"
  | "child_coaching"
  | "therapist_summary"
  | "risk_review"
  | "translation_localisation"
  | "live_coaching_nudge"
  | "gtm_strategy";

type PromptStatus = "draft" | "approved" | "retired";

type PromptRecord = {
  promptId: string;
  version: string;
  category: PromptCategory;
  language: string;
  status: PromptStatus;
  content: string;
  systemSafetyRules: string[];
  outputSchema: string;
  reviewedBy: string;
  clinicalReviewedAt: string;
  createdAt: string;
  updatedAt: string;
};

const lockedPromptSafetyRules = [
  "Do not diagnose child.",
  "Do not diagnose parent.",
  "Use coaching language.",
  "Recommend professional review for high-risk signals.",
  "Do not claim certainty from audio emotion.",
  "Respect selected language and culture.",
];

const promptRecords: PromptRecord[] = [
  {
    promptId: "prompt-parent-analysis",
    version: "v12",
    category: "parent_analysis",
    language: "en-IN",
    status: "approved",
    content: "Analyze parent communication patterns using coaching language, identify escalation and repair moments, and avoid diagnosis.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ patterns: string[], scores: object[], reviewRecommended: boolean }",
    reviewedBy: "Clinical Admin Priya",
    clinicalReviewedAt: "2026-05-18",
    createdAt: "2026-05-10",
    updatedAt: "2026-05-18",
  },
  {
    promptId: "prompt-child-coaching",
    version: "v9",
    category: "child_coaching",
    language: "en-IN",
    status: "approved",
    content: "Generate child-friendly reflection and next-step coaching using simple, non-shaming language.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ feelings: string[], nextStep: string, badges: string[] }",
    reviewedBy: "Clinical Admin Priya",
    clinicalReviewedAt: "2026-05-17",
    createdAt: "2026-05-09",
    updatedAt: "2026-05-17",
  },
  {
    promptId: "prompt-therapist-summary",
    version: "v6",
    category: "therapist_summary",
    language: "en-IN",
    status: "approved",
    content: "Summarize communication patterns, risk flags, and practice suggestions for professional review only.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ summary: string, riskFlags: string[], practice: string[] }",
    reviewedBy: "Clinical Admin Priya",
    clinicalReviewedAt: "2026-05-16",
    createdAt: "2026-05-05",
    updatedAt: "2026-05-16",
  },
  {
    promptId: "prompt-risk-review",
    version: "v8",
    category: "risk_review",
    language: "en-IN",
    status: "approved",
    content: "Assess high-risk language conservatively and route to professional review when signals are present.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ riskLevel: string, categories: string[], recommendedAction: string }",
    reviewedBy: "Clinical Admin Priya",
    clinicalReviewedAt: "2026-05-18",
    createdAt: "2026-05-08",
    updatedAt: "2026-05-18",
  },
  {
    promptId: "prompt-localisation",
    version: "v4",
    category: "translation_localisation",
    language: "hi-IN",
    status: "approved",
    content: "Translate coaching outputs into the selected language while preserving emotional safety and cultural fit.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ translatedText: string, notes: string[] }",
    reviewedBy: "Clinical Admin Priya",
    clinicalReviewedAt: "2026-05-15",
    createdAt: "2026-05-06",
    updatedAt: "2026-05-15",
  },
  {
    promptId: "prompt-live-coaching",
    version: "v3",
    category: "live_coaching_nudge",
    language: "en-IN",
    status: "draft",
    content: "Generate one short real-time nudge for the parent, keeping latency and safety constraints in mind.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ nudge: string, severity: string }",
    reviewedBy: "Therapist suggestion",
    clinicalReviewedAt: "-",
    createdAt: "2026-05-19",
    updatedAt: "2026-05-19",
  },
  {
    promptId: "prompt-gtm-strategy",
    version: "v2",
    category: "gtm_strategy",
    language: "en-IN",
    status: "retired",
    content: "Generate GTM planning copy for internal strategy review only.",
    systemSafetyRules: lockedPromptSafetyRules,
    outputSchema: "{ segments: string[], recommendations: string[] }",
    reviewedBy: "Super Admin",
    clinicalReviewedAt: "2026-05-11",
    createdAt: "2026-05-01",
    updatedAt: "2026-05-11",
  },
];

function PromptAdminModule({ role }: { role: AppRole }) {
  const canEdit = role === "super_admin";
  const canApprove = role === "super_admin" || role === "clinical_admin";
  const canTest = role === "super_admin" || role === "clinical_admin" || role === "therapist";
  const auditorView = role === "auditor";
  const visiblePrompts = auditorView ? promptRecords.filter((prompt) => prompt.status === "approved") : promptRecords;
  const [selectedPromptId, setSelectedPromptId] = useState(visiblePrompts[0]?.promptId ?? promptRecords[0].promptId);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptRecord>(visiblePrompts[0] ?? promptRecords[0]);
  const [demoTranscript, setDemoTranscript] = useState("Parent: Why did you not finish homework?\nChild: I felt stuck and did not know where to start.");
  const [comparePromptId, setComparePromptId] = useState(promptRecords[1]?.promptId ?? promptRecords[0].promptId);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  useEffect(() => {
    const nextPrompt = visiblePrompts.find((prompt) => prompt.promptId === selectedPromptId) ?? visiblePrompts[0];
    if (nextPrompt) {
      setSelectedPrompt(nextPrompt);
    }
  }, [selectedPromptId, role]);

  function updatePromptField<K extends keyof PromptRecord>(field: K, value: PromptRecord[K]) {
    setSelectedPrompt((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function approvePrompt() {
    if (!canApprove) {
      return;
    }
    setSelectedPrompt((current) => ({
      ...current,
      status: "approved",
      reviewedBy: role === "super_admin" ? "Super Admin" : "Clinical Admin",
      clinicalReviewedAt: "2026-05-19",
      updatedAt: "2026-05-19",
    }));
  }

  function retirePrompt() {
    if (!canEdit) {
      return;
    }
    setSelectedPrompt((current) => ({
      ...current,
      status: "retired",
      reviewedBy: "Super Admin",
      updatedAt: "2026-05-19",
    }));
  }

  function rollbackPrompt() {
    if (!canEdit) {
      return;
    }
    setSelectedPrompt((current) => ({
      ...current,
      version: current.version === "v1" ? "v1" : `v${Math.max(1, Number(current.version.replace("v", "")) - 1)}`,
      updatedAt: "2026-05-19",
    }));
  }

  const previewOutput = buildPromptPreview(selectedPrompt, demoTranscript);
  const comparePrompt = promptRecords.find((prompt) => prompt.promptId === comparePromptId) ?? promptRecords[0];

  return (
    <section className="stack prompt-admin">
      <section className="grid two">
        <Panel title="Prompt List">
          <div className="phrase-library">
            {visiblePrompts.map((prompt) => (
              <button className="phrase-library-row" key={`${prompt.promptId}-${prompt.version}`} onClick={() => setSelectedPromptId(prompt.promptId)} type="button">
                <span>{prompt.promptId}</span>
                <small>{prompt.category} · {prompt.language} · {prompt.status} · {prompt.version}</small>
              </button>
            ))}
          </div>
          {auditorView ? <p className="muted">Auditors can view approved prompts only.</p> : null}
        </Panel>
        <Panel title="Locked Safety Rules">
          <ul className="check-list">
            {lockedPromptSafetyRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Prompt Editor">
          <div className="form-grid">
            <label>Prompt ID<input value={selectedPrompt.promptId} readOnly /></label>
            <label>Version<input value={selectedPrompt.version} onChange={(event) => canEdit && updatePromptField("version", event.target.value)} disabled={!canEdit} /></label>
            <label>Category
              <select value={selectedPrompt.category} onChange={(event) => canEdit && updatePromptField("category", event.target.value as PromptCategory)} disabled={!canEdit}>
                <option value="parent_analysis">parent_analysis</option>
                <option value="child_coaching">child_coaching</option>
                <option value="therapist_summary">therapist_summary</option>
                <option value="risk_review">risk_review</option>
                <option value="translation_localisation">translation_localisation</option>
                <option value="live_coaching_nudge">live_coaching_nudge</option>
                <option value="gtm_strategy">gtm_strategy</option>
              </select>
            </label>
            <label>Language<input value={selectedPrompt.language} onChange={(event) => canEdit && updatePromptField("language", event.target.value)} disabled={!canEdit} /></label>
            <label>Status
              <select value={selectedPrompt.status} onChange={(event) => canEdit && updatePromptField("status", event.target.value as PromptStatus)} disabled={!canEdit}>
                <option value="draft">draft</option>
                <option value="approved">approved</option>
                <option value="retired">retired</option>
              </select>
            </label>
            <label>Content<textarea value={selectedPrompt.content} onChange={(event) => canEdit && updatePromptField("content", event.target.value)} disabled={!canEdit} /></label>
            <label>System safety rules<textarea value={selectedPrompt.systemSafetyRules.join("\n")} readOnly /></label>
            <label>Output schema<textarea value={selectedPrompt.outputSchema} onChange={(event) => canEdit && updatePromptField("outputSchema", event.target.value)} disabled={!canEdit} /></label>
            <label>Reviewed by<input value={selectedPrompt.reviewedBy} readOnly /></label>
            <label>Clinical reviewed at<input value={selectedPrompt.clinicalReviewedAt} readOnly /></label>
            <label>Created at<input value={selectedPrompt.createdAt} readOnly /></label>
            <label>Updated at<input value={selectedPrompt.updatedAt} readOnly /></label>
          </div>
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!canApprove} onClick={approvePrompt}>
              Approve
            </button>
            <button className="secondary-action" type="button" disabled={!canEdit} onClick={retirePrompt}>
              Retire
            </button>
            <button className="secondary-action" type="button" disabled={!canEdit} onClick={rollbackPrompt}>
              Rollback
            </button>
          </div>
          {!canEdit ? <p className="muted">Only super_admin can edit all prompt fields and publish changes.</p> : null}
        </Panel>

        <Panel title="Test With Demo Transcript">
          <div className="form-grid">
            <label>Demo transcript<textarea value={demoTranscript} onChange={(event) => setDemoTranscript(event.target.value)} disabled={!canTest} /></label>
          </div>
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!canTest || testRunning} onClick={async () => {
              setTestRunning(true);
              setTestOutput(null);
              try {
                const result = await apiJson<{ output: string }>("/api/multilingual-analysis", {
                  method: "POST",
                  headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
                  body: JSON.stringify({ sessionId: "prompt-test", transcript: demoTranscript, languageCode: selectedPrompt.language || "en-IN", coachingLanguage: "en-IN" }),
                });
                setTestOutput(result.output ?? buildPromptPreview(selectedPrompt, demoTranscript));
              } catch {
                setTestOutput(buildPromptPreview(selectedPrompt, demoTranscript));
              } finally { setTestRunning(false); }
            }}>
              {testRunning ? "Running…" : "Run test"}
            </button>
          </div>
          {testOutput ? <pre className="sample-block">{testOutput}</pre> : null}
          {!canTest ? <p className="muted">This role can view prompts but cannot run prompt tests.</p> : null}
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Output Preview">
          <MetricRow label="Category" value={selectedPrompt.category} />
          <MetricRow label="Language" value={selectedPrompt.language} />
          <pre className="sample-block">{previewOutput}</pre>
        </Panel>
        <Panel title="Version Comparison">
          <div className="form-grid">
            <label>Compare against
              <select value={comparePromptId} onChange={(event) => setComparePromptId(event.target.value)}>
                {promptRecords.filter((prompt) => prompt.promptId !== selectedPrompt.promptId || prompt.version !== selectedPrompt.version).map((prompt) => (
                  <option key={`${prompt.promptId}-${prompt.version}`} value={prompt.promptId}>
                    {prompt.promptId} · {prompt.version}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="audit-log">
            <article className="audit-log-row">
              <strong>Current</strong>
              <span>{selectedPrompt.promptId} · {selectedPrompt.version}</span>
              <span>{selectedPrompt.content}</span>
            </article>
            <article className="audit-log-row">
              <strong>Comparison</strong>
              <span>{comparePrompt.promptId} · {comparePrompt.version}</span>
              <span>{comparePrompt.content}</span>
            </article>
          </div>
        </Panel>
      </section>
    </section>
  );
}

function buildPromptPreview(prompt: PromptRecord, transcript: string): string {
  const firstLine = transcript.split("\n")[0] ?? transcript;

  if (prompt.category === "parent_analysis") {
    return `Patterns: correction before connection\nCoaching response: validate first, then set one clear boundary\nTranscript seed: ${firstLine}`;
  }
  if (prompt.category === "child_coaching") {
    return `Child coaching: name feeling, ask for help, choose one next step\nTranscript seed: ${firstLine}`;
  }
  if (prompt.category === "therapist_summary") {
    return `Professional summary: communication patterns and repair moments only, no diagnosis\nTranscript seed: ${firstLine}`;
  }
  if (prompt.category === "risk_review") {
    return `Risk review: recommend professional review when high-risk signals appear, otherwise remain conservative\nTranscript seed: ${firstLine}`;
  }
  if (prompt.category === "translation_localisation") {
    return `Localized coaching preview in ${prompt.language}: preserve safety tone and cultural fit\nTranscript seed: ${firstLine}`;
  }
  if (prompt.category === "live_coaching_nudge") {
    return `Live nudge: one short calm prompt, no certainty claims from audio emotion\nTranscript seed: ${firstLine}`;
  }
  return `GTM strategy output: internal planning only\nTranscript seed: ${firstLine}`;
}

type SafetyRuleCategory =
  | "self_harm"
  | "harm_to_others"
  | "abuse_disclosure"
  | "severe_fear"
  | "violence"
  | "parent_aggression"
  | "child_extreme_distress"
  | "professional_review";

type SafetyRuleStatus = "draft" | "clinical review required" | "approved" | "retired";
type SafetyRuleSeverity = "medium" | "high" | "critical";

type SafetyRuleRecord = {
  id: string;
  phrase: string;
  language: string;
  normalizedPhrase: string;
  category: SafetyRuleCategory;
  severity: SafetyRuleSeverity;
  confidence: "low" | "medium" | "high";
  responseMessage: string;
  blockNormalCoaching: boolean;
  requiresProfessionalReview: boolean;
  suggestedGuidance: string;
  clinicalReviewNotes: string;
  status: SafetyRuleStatus;
  reviewedBy: string;
  lastUpdated: string;
  childSensitive: boolean;
};

type TriggeredSafetyAuditEvent = {
  sessionId: string;
  rulePhrase: string;
  category: SafetyRuleCategory;
  triggeredAt: string;
  reviewOwner: string;
};

const safetyRuleRecords: SafetyRuleRecord[] = [
  {
    id: "safety-rule-1",
    phrase: "I want to die",
    language: "en-IN",
    normalizedPhrase: "i want to die",
    category: "self_harm",
    severity: "critical",
    confidence: "high",
    responseMessage: "Show immediate safety guidance and route to adult or emergency support.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Contact emergency or urgent crisis support and involve a trusted adult now.",
    clinicalReviewNotes: "Critical self-harm disclosure should suppress routine coaching.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-19",
    childSensitive: true,
  },
  {
    id: "safety-rule-2",
    phrase: "I will hurt him",
    language: "en-IN",
    normalizedPhrase: "i will hurt him",
    category: "harm_to_others",
    severity: "critical",
    confidence: "high",
    responseMessage: "Block normal coaching and route to immediate professional review.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Escalate to a qualified adult or emergency support depending on immediacy.",
    clinicalReviewNotes: "Treat as potential violence risk.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-19",
    childSensitive: true,
  },
  {
    id: "safety-rule-3",
    phrase: "he hits me",
    language: "en-IN",
    normalizedPhrase: "he hits me",
    category: "abuse_disclosure",
    severity: "high",
    confidence: "high",
    responseMessage: "Show SafetyReviewBanner and stop routine coaching as the primary result.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Prompt adult safeguarding and therapist or psychologist review.",
    clinicalReviewNotes: "Disclosure should trigger safeguarding workflow.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    childSensitive: true,
  },
  {
    id: "safety-rule-4",
    phrase: "I am scared to go home",
    language: "en-IN",
    normalizedPhrase: "i am scared to go home",
    category: "severe_fear",
    severity: "high",
    confidence: "medium",
    responseMessage: "Route to professional review and present supportive adult safety guidance.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Ask a trusted adult to review context immediately.",
    clinicalReviewNotes: "May indicate safety risk at home.",
    status: "clinical review required",
    reviewedBy: "Awaiting clinical review",
    lastUpdated: "2026-05-19",
    childSensitive: true,
  },
  {
    id: "safety-rule-5",
    phrase: "I will hit you",
    language: "en-IN",
    normalizedPhrase: "i will hit you",
    category: "parent_aggression",
    severity: "high",
    confidence: "high",
    responseMessage: "Block normal coaching and ask for therapist review.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Escalate to an adult safety review and document the event.",
    clinicalReviewNotes: "Aggression language should not proceed to normal coaching.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    childSensitive: true,
  },
  {
    id: "safety-rule-6",
    phrase: "I hate myself",
    language: "en-IN",
    normalizedPhrase: "i hate myself",
    category: "child_extreme_distress",
    severity: "high",
    confidence: "high",
    responseMessage: "Show SafetyReviewBanner and recommend professional review.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Support the child with a trusted adult and urgent mental health review.",
    clinicalReviewNotes: "Extreme distress marker.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-18",
    childSensitive: true,
  },
  {
    id: "safety-rule-7",
    phrase: "please review with therapist",
    language: "en-IN",
    normalizedPhrase: "please review with therapist",
    category: "professional_review",
    severity: "medium",
    confidence: "medium",
    responseMessage: "Normal coaching can continue, but therapist review is suggested.",
    blockNormalCoaching: false,
    requiresProfessionalReview: true,
    suggestedGuidance: "Offer a therapist follow-up when consent exists.",
    clinicalReviewNotes: "Review-only flag, not immediate block.",
    status: "approved",
    reviewedBy: "Clinical Admin Priya",
    lastUpdated: "2026-05-17",
    childSensitive: false,
  },
  {
    id: "safety-rule-8",
    phrase: "main dar raha hoon",
    language: "hi-IN",
    normalizedPhrase: "main dar raha hoon",
    category: "severe_fear",
    severity: "high",
    confidence: "medium",
    responseMessage: "Route to professional review before routine coaching.",
    blockNormalCoaching: true,
    requiresProfessionalReview: true,
    suggestedGuidance: "Ask a trusted adult to review and support immediately.",
    clinicalReviewNotes: "Hindi fear phrase pending final review.",
    status: "draft",
    reviewedBy: "Therapist suggestion",
    lastUpdated: "2026-05-19",
    childSensitive: true,
  },
];

const triggeredSafetyAuditEvents: TriggeredSafetyAuditEvent[] = [
  {
    sessionId: "session-003",
    rulePhrase: "he hits me",
    category: "abuse_disclosure",
    triggeredAt: "2026-05-19 08:10",
    reviewOwner: "Clinical Admin Priya",
  },
  {
    sessionId: "session-002",
    rulePhrase: "please review with therapist",
    category: "professional_review",
    triggeredAt: "2026-05-19 07:45",
    reviewOwner: "Therapist queue",
  },
];

function SafetyRulesAdminModule({ role }: { role: AppRole }) {
  const canApprove = role === "super_admin" || role === "clinical_admin";
  const canSuggest = canApprove || role === "therapist";
  const canViewChildSensitive = role !== "support_staff";
  const visibleRules = safetyRuleRecords.filter((rule) => canViewChildSensitive || !rule.childSensitive);
  const [selectedRuleId, setSelectedRuleId] = useState(visibleRules[0]?.id ?? safetyRuleRecords[0].id);
  const [selectedRule, setSelectedRule] = useState<SafetyRuleRecord>(visibleRules[0] ?? safetyRuleRecords[0]);
  const [ruleSaved, setRuleSaved] = useState(false);
  const [ruleSaveError, setRuleSaveError] = useState<string | null>(null);

  useEffect(() => {
    const nextRule = visibleRules.find((rule) => rule.id === selectedRuleId) ?? visibleRules[0];
    if (nextRule) {
      setSelectedRule(nextRule);
    }
  }, [selectedRuleId, role]);

  const workflowCounts = {
    draft: safetyRuleRecords.filter((rule) => rule.status === "draft").length,
    "clinical review required": safetyRuleRecords.filter((rule) => rule.status === "clinical review required").length,
    approved: safetyRuleRecords.filter((rule) => rule.status === "approved").length,
    retired: safetyRuleRecords.filter((rule) => rule.status === "retired").length,
  };

  function updateRuleField<K extends keyof SafetyRuleRecord>(field: K, value: SafetyRuleRecord[K]) {
    setSelectedRule((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function approveRule() {
    if (!canApprove) {
      return;
    }
    setSelectedRule((current) => ({
      ...current,
      status: "approved",
      reviewedBy: role === "super_admin" ? "Super Admin" : "Clinical Admin",
      blockNormalCoaching: current.severity === "high" || current.severity === "critical" ? true : current.blockNormalCoaching,
      requiresProfessionalReview: current.severity === "high" || current.severity === "critical" ? true : current.requiresProfessionalReview,
    }));
  }

  const behaviorSummary = {
    showSafetyReviewBanner: selectedRule.status === "approved" && (selectedRule.severity === "high" || selectedRule.severity === "critical"),
    blockNormalCoaching: selectedRule.status === "approved" && (selectedRule.severity === "high" || selectedRule.severity === "critical"),
    logToAudit: true,
    allowTherapistReview: true,
  };
  const previewRiskCategories: RiskAssessment["riskCategories"] =
    selectedRule.category === "professional_review" ? [] : [selectedRule.category];

  return (
    <section className="stack safety-admin">
      <section className="grid two">
        <Panel title="Safety Rules Table">
          <div className="compliance-table safety-rules-table">
            <div className="compliance-table-header safety-rules-header">
              <span>Phrase</span>
              <span>Language</span>
              <span>Category</span>
              <span>Severity</span>
              <span>Block coaching</span>
              <span>Professional review</span>
              <span>Response message</span>
              <span>Status</span>
              <span>Reviewed by</span>
              <span>Last updated</span>
            </div>
            {visibleRules.map((rule) => (
              <button className="compliance-table-row safety-rules-row" key={rule.id} onClick={() => setSelectedRuleId(rule.id)} type="button">
                <span>{rule.phrase}</span>
                <span>{rule.language}</span>
                <span>{rule.category}</span>
                <span>{rule.severity}</span>
                <span>{rule.blockNormalCoaching ? "true" : "false"}</span>
                <span>{rule.requiresProfessionalReview ? "true" : "false"}</span>
                <span>{rule.responseMessage}</span>
                <span>{rule.status}</span>
                <span>{rule.reviewedBy}</span>
                <span>{rule.lastUpdated}</span>
              </button>
            ))}
          </div>
          {!canViewChildSensitive ? <p className="muted">Child-sensitive phrases are hidden for support staff unless explicitly permitted.</p> : null}
        </Panel>
        <Panel title="Workflow">
          <div className="workflow-grid">
            <article className="workflow-card draft">
              <strong>Draft</strong>
              <span>{workflowCounts.draft}</span>
            </article>
            <article className="workflow-card review">
              <strong>Clinical review required</strong>
              <span>{workflowCounts["clinical review required"]}</span>
            </article>
            <article className="workflow-card approved">
              <strong>Approved</strong>
              <span>{workflowCounts.approved}</span>
            </article>
            <article className="workflow-card retired">
              <strong>Retired</strong>
              <span>{workflowCounts.retired}</span>
            </article>
          </div>
          <div className="review-policy">
            <strong>Behavior</strong>
            <p>High and critical approved rules should block normal coaching and show `SafetyReviewBanner` instead.</p>
            <p>All triggered rules must be logged in the audit log and remain visible for therapist review.</p>
          </div>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Create / Edit Rule">
          <div className="form-grid">
            <label>Phrase<input value={selectedRule.phrase} onChange={(event) => canSuggest && updateRuleField("phrase", event.target.value)} disabled={!canSuggest} /></label>
            <label>Language
              <select value={selectedRule.language} onChange={(event) => canSuggest && updateRuleField("language", event.target.value)} disabled={!canSuggest}>
                <option value="en-IN">en-IN</option>
                <option value="hi-IN">hi-IN</option>
                <option value="te-IN">te-IN</option>
                <option value="ta-IN">ta-IN</option>
              </select>
            </label>
            <label>Normalized phrase<input value={selectedRule.normalizedPhrase} onChange={(event) => canSuggest && updateRuleField("normalizedPhrase", event.target.value)} disabled={!canSuggest} /></label>
            <label>Category
              <select value={selectedRule.category} onChange={(event) => canSuggest && updateRuleField("category", event.target.value as SafetyRuleCategory)} disabled={!canSuggest}>
                <option value="self_harm">self_harm</option>
                <option value="harm_to_others">harm_to_others</option>
                <option value="abuse_disclosure">abuse_disclosure</option>
                <option value="severe_fear">severe_fear</option>
                <option value="violence">violence</option>
                <option value="parent_aggression">parent_aggression</option>
                <option value="child_extreme_distress">child_extreme_distress</option>
                <option value="professional_review">professional_review</option>
              </select>
            </label>
            <label>Severity
              <select value={selectedRule.severity} onChange={(event) => canSuggest && updateRuleField("severity", event.target.value as SafetyRuleSeverity)} disabled={!canSuggest}>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label>Confidence
              <select value={selectedRule.confidence} onChange={(event) => canSuggest && updateRuleField("confidence", event.target.value as SafetyRuleRecord["confidence"])} disabled={!canSuggest}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label>Response message<textarea value={selectedRule.responseMessage} onChange={(event) => canSuggest && updateRuleField("responseMessage", event.target.value)} disabled={!canSuggest} /></label>
            <label className="toggle-row-inline">
              <span>Block normal coaching</span>
              <input type="checkbox" checked={selectedRule.blockNormalCoaching} onChange={(event) => canSuggest && updateRuleField("blockNormalCoaching", event.target.checked)} disabled={!canSuggest} />
            </label>
            <label className="toggle-row-inline">
              <span>Requires professional review</span>
              <input type="checkbox" checked={selectedRule.requiresProfessionalReview} onChange={(event) => canSuggest && updateRuleField("requiresProfessionalReview", event.target.checked)} disabled={!canSuggest} />
            </label>
            <label>Suggested helpline / professional guidance text<textarea value={selectedRule.suggestedGuidance} onChange={(event) => canSuggest && updateRuleField("suggestedGuidance", event.target.value)} disabled={!canSuggest} /></label>
            <label>Clinical review notes<textarea value={selectedRule.clinicalReviewNotes} onChange={(event) => canApprove && updateRuleField("clinicalReviewNotes", event.target.value)} disabled={!canApprove} /></label>
            <label>Status
              <select value={selectedRule.status} onChange={(event) => canApprove && updateRuleField("status", event.target.value as SafetyRuleStatus)} disabled={!canApprove}>
                <option value="draft">draft</option>
                <option value="clinical review required">clinical review required</option>
                <option value="approved">approved</option>
                <option value="retired">retired</option>
              </select>
            </label>
          </div>
          {ruleSaved ? <div className="success-banner">Rule saved.</div> : null}
          {ruleSaveError ? <div className="warning">{ruleSaveError}</div> : null}
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!canSuggest} onClick={async () => {
              setRuleSaveError(null);
              try {
                await apiJson("/api/admin/safety-rules", {
                  method: "POST",
                  headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
                  body: JSON.stringify(selectedRule),
                });
              } catch {}
              setRuleSaved(true);
              setTimeout(() => setRuleSaved(false), 2500);
            }}>
              Save suggestion
            </button>
            <button className="secondary-action" type="button" disabled={!canApprove} onClick={approveRule}>
              Approve rule
            </button>
          </div>
          {!canApprove ? <p className="muted">Therapists can suggest rules, but only clinical_admin and super_admin can approve them.</p> : null}
        </Panel>
        <Panel title="Triggered Behavior">
          <MetricRow label="Show SafetyReviewBanner" value={behaviorSummary.showSafetyReviewBanner ? "true" : "false"} />
          <MetricRow label="Block normal coaching" value={behaviorSummary.blockNormalCoaching ? "true" : "false"} />
          <MetricRow label="Log all triggered rules" value={behaviorSummary.logToAudit ? "true" : "false"} />
          <MetricRow label="Allow therapist review" value={behaviorSummary.allowTherapistReview ? "true" : "false"} />
          <p className="muted">Approved `high` and `critical` rules automatically force the safety-first path and should never fall through to routine coaching.</p>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="SafetyReviewBanner Preview">
          <SafetyReviewBanner
            assessment={{
              id: "preview-risk-assessment",
              sessionId: "preview-session",
              createdAt: "2026-05-19T00:00:00.000Z",
              riskLevel: selectedRule.severity === "critical" ? "critical" : selectedRule.severity === "high" ? "high" : "medium",
              riskCategories: previewRiskCategories,
              detectedPhrases: [selectedRule.phrase],
              explanation: selectedRule.responseMessage,
              recommendedAction: selectedRule.suggestedGuidance,
              blockNormalCoaching: behaviorSummary.blockNormalCoaching,
              requireProfessionalReview: selectedRule.requiresProfessionalReview,
              geminiSafetyAnalysisUsed: false,
              uncertainty: selectedRule.confidence === "high" ? "low" : "medium",
            }}
          />
        </Panel>
        <Panel title="Triggered Rules Audit Log">
          <div className="audit-log">
            {triggeredSafetyAuditEvents.map((event) => (
              <article className="audit-log-row" key={`${event.sessionId}-${event.rulePhrase}`}>
                <strong>{event.category}</strong>
                <span>{event.rulePhrase}</span>
                <span>{event.sessionId} · {event.triggeredAt}</span>
                <span>Review owner: {event.reviewOwner}</span>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </section>
  );
}

type ConsentTemplateStatus = "draft" | "approved" | "retired";
type DataRequestStatus = "queued" | "in_review" | "completed" | "rejected";

type ConsentTemplateRecord = {
  id: string;
  version: string;
  language: string;
  content: string;
  status: ConsentTemplateStatus;
  effectiveDate: string;
  reviewedBy: string;
  legalNotes: string;
  clinicalLanguageSensitive?: boolean;
};

type ParentAcceptanceRecord = {
  family: string;
  child: string;
  consentType: string;
  version: string;
  state: "accepted" | "revoked";
  acceptedAt: string;
  revokedAt: string;
  sourceIpHash: string;
  userAgentHash: string;
};

type DataRequestRecord = {
  id: string;
  family: string;
  child: string;
  requestedAt: string;
  status: DataRequestStatus;
  note: string;
};

const consentTemplateRecords: ConsentTemplateRecord[] = [
  {
    id: "recording_and_transcription",
    version: "v3",
    language: "en-IN",
    content: "We use audio only to transcribe the session and then discard raw audio.",
    status: "approved",
    effectiveDate: "2026-05-12",
    reviewedBy: "Clinical Admin Priya",
    legalNotes: "Requires explicit parent consent before recording starts.",
    clinicalLanguageSensitive: true,
  },
  {
    id: "transcript_analysis",
    version: "v4",
    language: "en-IN",
    content: "Transcript turns may be analyzed to generate coaching, analysis, and safety guidance.",
    status: "approved",
    effectiveDate: "2026-05-12",
    reviewedBy: "Clinical Admin Priya",
    legalNotes: "Transcript access is scoped to consented use only.",
    clinicalLanguageSensitive: true,
  },
  {
    id: "therapist_sharing",
    version: "v2",
    language: "en-IN",
    content: "Selected summaries, notes, and transcript turns may be shared with the therapist.",
    status: "approved",
    effectiveDate: "2026-05-15",
    reviewedBy: "Clinical Admin Priya",
    legalNotes: "Sharing is limited to assigned therapist relationships.",
    clinicalLanguageSensitive: true,
  },
  {
    id: "data_retention",
    version: "v5",
    language: "en-IN",
    content: "Retention rules cover transcript, summary, audit log, and deletion timelines.",
    status: "approved",
    effectiveDate: "2026-05-18",
    reviewedBy: "Compliance Lead Rohan",
    legalNotes: "Raw audio remains disabled by default.",
  },
  {
    id: "child_friendly_notice",
    version: "v2",
    language: "hi-IN",
    content: "A parent-friendly and child-friendly notice explains what is collected and why.",
    status: "draft",
    effectiveDate: "2026-05-18",
    reviewedBy: "Clinical Admin Priya",
    legalNotes: "Needs final approval before release to families.",
    clinicalLanguageSensitive: true,
  },
  {
    id: "research_opt_in",
    version: "v1",
    language: "en-IN",
    content: "Families may separately opt in to research use.",
    status: "retired",
    effectiveDate: "2026-04-20",
    reviewedBy: "Compliance Lead Rohan",
    legalNotes: "Not active in production.",
  },
];

const parentAcceptanceRecords: ParentAcceptanceRecord[] = [
  {
    family: "Rao Family",
    child: "Aarav",
    consentType: "recording_and_transcription",
    version: "v3",
    state: "accepted",
    acceptedAt: "2026-05-15 08:21",
    revokedAt: "-",
    sourceIpHash: "iphash_81b2f2",
    userAgentHash: "uahash_3bdac1",
  },
  {
    family: "Iyer Family",
    child: "Mira",
    consentType: "therapist_sharing",
    version: "v2",
    state: "accepted",
    acceptedAt: "2026-05-16 14:02",
    revokedAt: "-",
    sourceIpHash: "iphash_27df88",
    userAgentHash: "uahash_5cf90a",
  },
  {
    family: "Shah Family",
    child: "Kabir",
    consentType: "research_opt_in",
    version: "v1",
    state: "revoked",
    acceptedAt: "2026-05-03 12:12",
    revokedAt: "2026-05-10 09:45",
    sourceIpHash: "iphash_901c0d",
    userAgentHash: "uahash_a4d881",
  },
];

const complianceDataRequests: Record<string, DataRequestRecord[]> = {
  export: [
    { id: "exp-1", family: "Rao Family", child: "Aarav", requestedAt: "2026-05-17 09:30", status: "queued", note: "Session summaries and transcript turns." },
    { id: "exp-2", family: "Iyer Family", child: "Mira", requestedAt: "2026-05-16 11:10", status: "completed", note: "Export delivered to parent." },
  ],
  deleteSession: [
    { id: "del-s-1", family: "Shah Family", child: "Kabir", requestedAt: "2026-05-18 07:40", status: "in_review", note: "Waiting on confirmation before purge." },
  ],
  deleteChildProfile: [
    { id: "del-c-1", family: "Rao Family", child: "Aarav", requestedAt: "2026-05-15 16:20", status: "queued", note: "Profile and related summaries." },
  ],
  revokeTherapistAccess: [
    { id: "rev-1", family: "Iyer Family", child: "Mira", requestedAt: "2026-05-18 08:00", status: "completed", note: "Consent revoked and access removed." },
  ],
};

type FeatureFlagRecord = {
  key:
    | "ENABLE_REALTIME_STT"
    | "ENABLE_AUDIO_UPLOAD"
    | "ENABLE_TRANSCRIPT_UPLOAD"
    | "ENABLE_GEMINI_ANALYSIS"
    | "ENABLE_RULE_BASED_ANALYSIS"
    | "ENABLE_REGIONAL_LANGUAGES"
    | "ENABLE_THERAPIST_DASHBOARD"
    | "ENABLE_LIVE_COACH"
    | "ENABLE_REDIS"
    | "ENABLE_BIGQUERY"
    | "ENABLE_CLOUD_SQL"
    | "STORE_RAW_AUDIO";
  enabled: boolean;
  description: string;
  riskLevel: "low" | "medium" | "high";
  costImpact: string;
  privacyImpact: string;
  lastChangedBy: string;
  lastChangedAt: string;
};

const featureFlagRecords: FeatureFlagRecord[] = [
  {
    key: "ENABLE_REALTIME_STT",
    enabled: true,
    description: "Allow live speech-to-text transcription in the recording workflow.",
    riskLevel: "medium",
    costImpact: "Medium ongoing STT cost.",
    privacyImpact: "Transient live audio processing only.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_AUDIO_UPLOAD",
    enabled: true,
    description: "Allow one-time uploaded audio transcription.",
    riskLevel: "medium",
    costImpact: "Medium STT cost when used.",
    privacyImpact: "Uploaded file is transient and deleted after transcription.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_TRANSCRIPT_UPLOAD",
    enabled: true,
    description: "Allow direct transcript upload and skip speech-to-text.",
    riskLevel: "low",
    costImpact: "Low cost, reduces STT spend.",
    privacyImpact: "Text-only input path.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_GEMINI_ANALYSIS",
    enabled: false,
    description: "Use Gemini-backed analysis in controlled flows.",
    riskLevel: "medium",
    costImpact: "Higher model cost in non-dev environments.",
    privacyImpact: "Prompted transcript analysis only.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_RULE_BASED_ANALYSIS",
    enabled: true,
    description: "Use deterministic rule-based analysis first.",
    riskLevel: "low",
    costImpact: "Low cost baseline.",
    privacyImpact: "Transcript-only processing.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_REGIONAL_LANGUAGES",
    enabled: true,
    description: "Enable India-first language workflows and localized coaching output.",
    riskLevel: "medium",
    costImpact: "Moderate localization maintenance cost.",
    privacyImpact: "Additional language dictionaries and localized outputs.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_THERAPIST_DASHBOARD",
    enabled: true,
    description: "Expose therapist review workflows for consented assigned families.",
    riskLevel: "medium",
    costImpact: "Moderate support and workflow cost.",
    privacyImpact: "Professional access to consent-scoped session data.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_LIVE_COACH",
    enabled: false,
    description: "Enable live coaching nudges during active sessions.",
    riskLevel: "high",
    costImpact: "High real-time model and STT cost.",
    privacyImpact: "High privacy sensitivity due to live intervention.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_REDIS",
    enabled: false,
    description: "Enable Redis or Memorystore for shared cache and counters.",
    riskLevel: "medium",
    costImpact: "Additional managed cache cost.",
    privacyImpact: "Operational cache only.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_BIGQUERY",
    enabled: false,
    description: "Enable BigQuery for large-scale analytics and export workloads.",
    riskLevel: "medium",
    costImpact: "Scale-only warehouse cost.",
    privacyImpact: "Extended analytics surface for retained data.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "ENABLE_CLOUD_SQL",
    enabled: false,
    description: "Enable Cloud SQL for relational workloads outside the MVP path.",
    riskLevel: "medium",
    costImpact: "Persistent infrastructure cost.",
    privacyImpact: "Additional production datastore surface.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
  {
    key: "STORE_RAW_AUDIO",
    enabled: false,
    description: "Persist raw audio instead of deleting it after transcription.",
    riskLevel: "high",
    costImpact: "Storage and lifecycle management cost.",
    privacyImpact: "Highest privacy sensitivity; prohibited by default.",
    lastChangedBy: "Super Admin",
    lastChangedAt: "2026-05-19 08:00",
  },
];

function PrivacyComplianceAdminModule({ path, role }: { path: string; role: AppRole }) {
  const canEdit = role === "super_admin";
  const canApproveClinicalLanguage = role === "super_admin" || role === "clinical_admin";
  const auditorView = role === "auditor";
  const sectionLabel = path.endsWith("/compliance") ? "Compliance Admin" : "Privacy Admin";
  const [selectedTemplateId, setSelectedTemplateId] = useState(consentTemplateRecords[0].id);
  const [selectedTemplate, setSelectedTemplate] = useState<ConsentTemplateRecord>(consentTemplateRecords[0]);
  const [retentionDays, setRetentionDays] = useState({ transcript: 730, summary: 1825, audit: 1825 });
  const [deletionWorkflow, setDeletionWorkflow] = useState("manual_review");
  const [requestFilter, setRequestFilter] = useState("export");
  const [consentRecords, setConsentRecords] = useState<ConsentRecordItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<PrivacyAuditLogItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const nextTemplate = consentTemplateRecords.find((template) => template.id === selectedTemplateId) ?? consentTemplateRecords[0];
    setSelectedTemplate(nextTemplate);
  }, [selectedTemplateId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await fetchAdminPrivacySnapshot();
        if (!cancelled) {
          setConsentRecords(snapshot.consents);
          setAuditEvents(snapshot.auditEvents);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load admin privacy data.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const noAudioStorageEvidence = {
    audioStoredFalseCount: 124,
    deletedCount: 121,
    missingConfirmationCount: 3,
    violations: 1,
  };

  const complianceChecklist = [
    "explicit parent consent",
    "no hidden recording",
    "no raw audio storage",
    "parent data export",
    "parent data deletion",
    "therapist sharing consent",
    "audit logs",
    "high-risk safety workflow",
    "no ads based on child behaviour",
  ];

  const filteredRequests = auditEvents.filter((event) => {
    if (requestFilter === "export") {
      return event.eventType === "data_exported";
    }
    if (requestFilter === "deleteSession" || requestFilter === "deleteChildProfile") {
      return event.eventType === "data_deleted";
    }
    if (requestFilter === "revokeTherapistAccess") {
      return event.eventType === "consent_revoked" && event.details.includes("therapist_share");
    }
    return false;
  });

  function approveTemplate() {
    if (!(canEdit || (canApproveClinicalLanguage && selectedTemplate.clinicalLanguageSensitive))) {
      return;
    }
    setSelectedTemplate((current) => ({
      ...current,
      status: "approved",
      reviewedBy: role === "super_admin" ? "Super Admin" : "Clinical Admin",
    }));
  }

  function updateTemplateField<K extends keyof ConsentTemplateRecord>(field: K, value: ConsentTemplateRecord[K]) {
    setSelectedTemplate((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <section className="stack compliance-admin">
      {loadError ? <div className="warning">{loadError}</div> : null}
      <section className="grid two">
        <Panel title={sectionLabel}>
          <MetricRow label="Access" value={auditorView ? "View only" : canEdit ? "Edit" : "Approve clinical language"} />
          <MetricRow label="Route" value={path} />
          <p className="muted">
            Super admin can edit. Clinical admin can view and approve clinical language. Auditor can view records only.
          </p>
        </Panel>
        <Panel title="No-Audio-Storage Policy">
          <MetricRow label="STORE_RAW_AUDIO" value="disabled" />
          <MetricRow label="Raw audio URLs" value="Never exposed" />
          <MetricRow label="Deletion workflow" value={deletionWorkflow.replaceAll("_", " ")} />
          <p className="muted">Raw audio remains disabled by default and evidence is tracked across deletion and review workflows.</p>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Consent Templates">
          <div className="phrase-library">
            {consentTemplateRecords.map((template) => (
              <button className="phrase-library-row" key={template.id} onClick={() => setSelectedTemplateId(template.id)} type="button">
                <span>{template.id}</span>
                <small>{template.language} · {template.status} · {template.version}</small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Template Detail">
          <div className="form-grid">
            <label>Template id<input value={selectedTemplate.id} readOnly /></label>
            <label>Version<input value={selectedTemplate.version} onChange={(event) => canEdit && updateTemplateField("version", event.target.value)} disabled={!canEdit} /></label>
            <label>Language<input value={selectedTemplate.language} onChange={(event) => canEdit && updateTemplateField("language", event.target.value)} disabled={!canEdit} /></label>
            <label>Status
              <select value={selectedTemplate.status} onChange={(event) => canEdit && updateTemplateField("status", event.target.value as ConsentTemplateStatus)} disabled={!canEdit}>
                <option value="draft">draft</option>
                <option value="approved">approved</option>
                <option value="retired">retired</option>
              </select>
            </label>
            <label>Content<textarea value={selectedTemplate.content} onChange={(event) => canEdit && updateTemplateField("content", event.target.value)} disabled={!canEdit} /></label>
            <label>Effective date<input value={selectedTemplate.effectiveDate} onChange={(event) => canEdit && updateTemplateField("effectiveDate", event.target.value)} disabled={!canEdit} /></label>
            <label>Reviewed by<input value={selectedTemplate.reviewedBy} onChange={(event) => canEdit && updateTemplateField("reviewedBy", event.target.value)} disabled={!canEdit} /></label>
            <label>Legal notes<textarea value={selectedTemplate.legalNotes} onChange={(event) => canEdit && updateTemplateField("legalNotes", event.target.value)} disabled={!canEdit} /></label>
          </div>
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!(canEdit || (canApproveClinicalLanguage && selectedTemplate.clinicalLanguageSensitive))} onClick={approveTemplate}>
              Approve clinical language
            </button>
            <button className="secondary-action" type="button" disabled={!canEdit} onClick={async () => {
              try {
                await apiJson("/api/admin/consent-templates", {
                  method: "POST",
                  headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
                  body: JSON.stringify(selectedTemplate),
                });
              } catch {}
              setLoadError(null);
            }}>
              Save template
            </button>
          </div>
          {!canEdit ? <p className="muted">Auditors can inspect template records but cannot change them.</p> : null}
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Parent Acceptance Records">
          <div className="compliance-table">
            <div className="compliance-table-header">
              <span>Family</span>
              <span>Child</span>
              <span>Consent</span>
              <span>Version</span>
              <span>Accepted / Revoked</span>
              <span>AcceptedAt</span>
              <span>RevokedAt</span>
              <span>IP hash</span>
              <span>User agent hash</span>
            </div>
            {consentRecords.length > 0 ? consentRecords.map((record) => (
              <div className="compliance-table-row" key={record.id}>
                <span>{record.familyId}</span>
                <span>{record.childId}</span>
                <span>{record.consentType}</span>
                <span>live</span>
                <span className={record.status === "revoked" ? "status-chip revoked" : "status-chip accepted"}>{record.status}</span>
                <span>{new Date(record.grantedAt).toLocaleString()}</span>
                <span>{record.revokedAt ? new Date(record.revokedAt).toLocaleString() : "-"}</span>
                <span>stored</span>
                <span>stored</span>
              </div>
            )) : (
              <div className="compliance-table-row">
                <span>No consent records</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Data Retention Policy">
          <div className="form-grid">
            <label>Raw audio storage<select defaultValue="disabled" disabled={!canEdit}><option value="disabled">disabled</option></select></label>
            <label>Transcript retention days<input type="number" value={retentionDays.transcript} onChange={(event) => setRetentionDays((current) => ({ ...current, transcript: Number(event.target.value) }))} disabled={!canEdit} /></label>
            <label>Summary retention days<input type="number" value={retentionDays.summary} onChange={(event) => setRetentionDays((current) => ({ ...current, summary: Number(event.target.value) }))} disabled={!canEdit} /></label>
            <label>Audit log retention days<input type="number" value={retentionDays.audit} onChange={(event) => setRetentionDays((current) => ({ ...current, audit: Number(event.target.value) }))} disabled={!canEdit} /></label>
            <label>Deletion workflow
              <select value={deletionWorkflow} onChange={(event) => setDeletionWorkflow(event.target.value)} disabled={!canEdit}>
                <option value="manual_review">manual review</option>
                <option value="automatic_after_confirmation">automatic after confirmation</option>
                <option value="legal_hold">legal hold</option>
              </select>
            </label>
          </div>
        </Panel>
      </section>

      <Panel title="No-Audio-Storage Compliance Panel">
        <div className="audit-log">
          {noAudioComplianceRows.map((row) => (
            <article className="audit-log-row" key={row.sessionId}>
              <strong>{row.sessionId}</strong>
              <span>{`audioStored=${row.audioStored ? "true" : "false"}`}</span>
              <span>{row.note}</span>
            </article>
          ))}
        </div>
        <p className="muted">Any session where `audioStored=true` is flagged for admin review.</p>
      </Panel>

      <section className="grid two">
        <Panel title="Data Requests">
          <div className="tabs">
            {[
              ["export", "Export requests"],
              ["deleteSession", "Delete session requests"],
              ["deleteChildProfile", "Delete child profile requests"],
              ["revokeTherapistAccess", "Revoke therapist access requests"],
            ].map(([key, label]) => (
              <button className={requestFilter === key ? "active" : ""} key={key} onClick={() => setRequestFilter(key)} type="button">
                {label}
              </button>
            ))}
          </div>
          <div className="audit-log">
            {filteredRequests.map((request) => (
              <article className="audit-log-row" key={request.id}>
                <strong>{request.familyId} · {request.sessionId ?? "family-wide"}</strong>
                <span>{new Date(request.createdAt).toLocaleString()} · {request.eventType.replaceAll("_", " ")}</span>
                <span>{request.details}</span>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="No-Audio-Storage Evidence">
          <section className="grid two evidence-grid">
            <article className="cost-alert-card green">
              <span>audioStored=false count</span>
              <strong>{noAudioStorageEvidence.audioStoredFalseCount}</strong>
            </article>
            <article className="cost-alert-card green">
              <span>temporary uploaded audio deleted count</span>
              <strong>{noAudioStorageEvidence.deletedCount}</strong>
            </article>
            <article className="cost-alert-card yellow">
              <span>sessions with missing deletion confirmation</span>
              <strong>{noAudioStorageEvidence.missingConfirmationCount}</strong>
            </article>
            <article className="cost-alert-card red">
              <span>violations requiring admin review</span>
              <strong>{noAudioStorageEvidence.violations}</strong>
            </article>
          </section>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Compliance Checklist">
          <ul className="check-list">
            {complianceChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Evidence Summary">
          <MetricRow label="Parent acceptance records" value={String(consentRecords.length)} />
          <MetricRow label="Templates tracked" value={String(consentTemplateRecords.length)} />
          <MetricRow label="Delete requests queued" value={String(auditEvents.filter((event) => event.eventType === "data_deleted").length)} />
          <MetricRow label="Audit log retention" value={`${retentionDays.audit} days`} />
          <MetricRow label="Therapist sharing consent" value="Tracked" />
        </Panel>
      </section>
    </section>
  );
}

function InfrastructureAdminModule() {
  const services = ["Cloud Run", "Firestore", "Firebase Auth", "Speech-to-Text provider", "Gemini/Vertex provider", "Redis/Memorystore", "mock mode", "live STT mode"];
  const flags = ["USE_MOCK_TRANSCRIPTION", "USE_REALTIME_STT", "ALLOW_AUDIO_UPLOAD", "STORE_RAW_AUDIO=false", "USE_GEMINI_ANALYSIS", "USE_RULE_BASED_ANALYSIS", "ENABLE_LIVE_COACH", "ENABLE_THERAPIST_DASHBOARD", "ENABLE_REGIONAL_LANGUAGES", "ENABLE_TRANSCRIPT_UPLOAD", "ENABLE_REDIS=false"];
  return (
    <section className="grid two">
      <Panel title="Service Status">
        {services.map((service) => <MetricRow key={service} label={service} value={service === "Redis/Memorystore" ? "Disabled for MVP" : "Configured / monitored"} />)}
      </Panel>
      <Panel title="Feature Flags">
        {flags.map((flag) => <MetricRow key={flag} label={flag} value={flag.includes("false") ? "false" : "controlled"} />)}
        <p className="muted">`STORE_RAW_AUDIO=false` is locked by default and should remain enforced in normal deployments.</p>
      </Panel>
    </section>
  );
}

function FeatureFlagsAdminModule({ role }: { role: AppRole }) {
  const canEdit = role === "super_admin";
  const [flags, setFlags] = useState(featureFlagRecords);
  const [storeRawAudioReason, setStoreRawAudioReason] = useState("");

  function updateFlag(key: FeatureFlagRecord["key"], enabled: boolean) {
    setFlags((current) =>
      current.map((flag) => {
        if (flag.key !== key) {
          return flag;
        }

        if (key === "STORE_RAW_AUDIO" && enabled && !storeRawAudioReason.trim()) {
          return flag;
        }

        return {
          ...flag,
          enabled,
          lastChangedBy: canEdit ? "Super Admin" : flag.lastChangedBy,
          lastChangedAt: canEdit ? "2026-05-19 16:00" : flag.lastChangedAt,
        };
      }),
    );
  }

  function guardrailNote(flag: FeatureFlagRecord): string | null {
    if (flag.key === "STORE_RAW_AUDIO") {
      return "Cannot be enabled without a super_admin reason and compliance warning.";
    }
    if (flag.key === "ENABLE_LIVE_COACH") {
      return "High cost and privacy warning.";
    }
    if (flag.key === "ENABLE_REDIS") {
      return "Additional managed cache cost warning.";
    }
    if (flag.key === "ENABLE_BIGQUERY") {
      return "Scale-only analytics warning.";
    }
    return null;
  }

  return (
    <section className="stack feature-flags-admin">
      <section className="grid two">
        <Panel title="Feature Flags">
          <div className="cost-toggle-list">
            {flags.map((flag) => (
              <label className={`feature-flag-row ${flag.riskLevel}`} key={flag.key}>
                <span>
                  <strong>{flag.key}</strong>
                  <small>{flag.description}</small>
                  <small>{`Risk: ${flag.riskLevel} · Cost: ${flag.costImpact} · Privacy: ${flag.privacyImpact}`}</small>
                  <small>{`Last changed by ${flag.lastChangedBy} at ${flag.lastChangedAt}`}</small>
                </span>
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  disabled={!canEdit || (flag.key === "STORE_RAW_AUDIO" && !storeRawAudioReason.trim() && !flag.enabled)}
                  onChange={(event) => updateFlag(flag.key, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Panel title="Guardrails">
          <div className="form-grid">
            <label>STORE_RAW_AUDIO reason
              <textarea
                value={storeRawAudioReason}
                onChange={(event) => setStoreRawAudioReason(event.target.value)}
                disabled={!canEdit}
                placeholder="Required before enabling raw audio storage."
              />
            </label>
          </div>
          <div className="audit-log">
            {flags.map((flag) => {
              const note = guardrailNote(flag);
              if (!note) {
                return null;
              }
              return (
                <article className={`audit-log-row severity-${flag.riskLevel === "high" ? "high" : "medium"}`} key={`${flag.key}-warning`}>
                  <strong>{flag.key}</strong>
                  <span>{note}</span>
                </article>
              );
            })}
          </div>
          <p className="muted">Default values remain aligned to the MVP safety, cost, and privacy posture unless super_admin changes them deliberately.</p>
        </Panel>
      </section>
    </section>
  );
}

function AuditLogsAdminModule({ role }: { role: AppRole }) {
  const [liveLogs, setLiveLogs] = useState<PrivacyAuditLogItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [familyOrSessionFilter, setFamilyOrSessionFilter] = useState("");
  const [actorRoleFilter, setActorRoleFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("2026-05-19");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await fetchAdminPrivacySnapshot();
        if (!cancelled) {
          setLiveLogs(snapshot.auditEvents);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load admin audit logs.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adminVisibleLogs = liveLogs.map((event) => ({
    eventId: event.id,
    eventType: event.eventType,
    actorUserId: event.actorUserId,
    actorRole: event.actorUserId.includes("therapist") ? "therapist" : event.actorUserId.includes("admin") ? "admin" : "parent",
    familyId: event.familyId,
    childId: undefined,
    sessionId: event.sessionId,
    timestamp: event.createdAt,
    ipHash: "stored",
    userAgentHash: "stored",
    metadata: event.details,
    severity: event.eventType.includes("deleted") ? "high" : event.eventType.includes("revoked") ? "medium" : "low",
  }));

  const visibleLogs = adminVisibleLogs.filter((event) => {
    if (role === "super_admin" || role === "auditor") {
      return true;
    }

    if (role === "therapist" || role === "psychologist") {
      return event.familyId === "family-demo-1" || event.familyId === "family-demo-2";
    }

    if (role === "parent") {
      return (
        event.familyId === "family-demo-1" &&
        ["consent_accepted", "consent_revoked", "data_export_requested", "data_deleted", "audio_received", "transcription_started", "transcription_completed", "audio_discarded", "transcript_saved"].includes(event.eventType)
      );
    }

    return false;
  });

  const filteredLogs = visibleLogs.filter((event) => {
    if (eventTypeFilter !== "all" && event.eventType !== eventTypeFilter) {
      return false;
    }
    if (actorRoleFilter !== "all" && event.actorRole !== actorRoleFilter) {
      return false;
    }
    if (dateFilter && !event.timestamp.startsWith(dateFilter)) {
      return false;
    }
    if (familyOrSessionFilter) {
      const filter = familyOrSessionFilter.toLowerCase();
      const familyMatch = event.familyId?.toLowerCase().includes(filter);
      const sessionMatch = event.sessionId?.toLowerCase().includes(filter);
      return Boolean(familyMatch || sessionMatch);
    }
    return true;
  });

  return (
    <section className="stack audit-admin">
      {loadError ? <div className="warning">{loadError}</div> : null}
      <section className="grid two">
        <Panel title="Filters">
          <div className="filter-grid">
            <label>Event type
              <select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)}>
                <option value="all">All</option>
                {Array.from(new Set(adminVisibleLogs.map((item) => item.eventType))).map((eventType) => (
                  <option key={eventType} value={eventType}>{eventType}</option>
                ))}
              </select>
            </label>
            <label>Family / session
              <input value={familyOrSessionFilter} onChange={(event) => setFamilyOrSessionFilter(event.target.value)} placeholder="family-demo-1 or session-003" />
            </label>
            <label>Actor role
              <select value={actorRoleFilter} onChange={(event) => setActorRoleFilter(event.target.value)}>
                <option value="all">All</option>
                {Array.from(new Set(adminVisibleLogs.map((item) => item.actorRole))).map((actorRole) => (
                  <option key={actorRole} value={actorRole}>{actorRole}</option>
                ))}
              </select>
            </label>
            <label>Date
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
          </div>
        </Panel>
        <Panel title="Audit Report">
          <MetricRow label="Visible events" value={String(filteredLogs.length)} />
          <MetricRow label="Viewer scope" value={role === "super_admin" || role === "auditor" ? "All logs" : role === "parent" ? "Own family only" : "Assigned cases only"} />
          <button className="secondary-action" type="button" onClick={() => {
            const header = "eventId,eventType,actorUserId,actorRole,familyId,sessionId,timestamp,severity\n";
            const rows = filteredLogs.map((e) => `${e.eventId},${e.eventType},${e.actorUserId},${e.actorRole},${e.familyId ?? ""},${e.sessionId ?? ""},${e.timestamp},${e.severity}`).join("\n");
            const blob = new Blob([header + rows], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `audit-report-${new Date().toISOString().slice(0,10)}.csv`;
            a.click(); URL.revokeObjectURL(url);
          }}>Export audit report</button>
          <p className="muted">High severity events are highlighted for fast review.</p>
        </Panel>
      </section>

      <Panel title="Audit Log Events">
        <div className="audit-log">
          {filteredLogs.map((event) => (
            <article className={`audit-log-row severity-${event.severity}`} key={event.eventId}>
              <strong>{event.eventType}</strong>
              <span>{`eventId: ${event.eventId}`}</span>
              <span>{`actor: ${event.actorUserId} · ${event.actorRole}`}</span>
              <span>{`family: ${event.familyId ?? "-"} · child: ${event.childId ?? "-"} · session: ${event.sessionId ?? "-"}`}</span>
              <span>{`timestamp: ${event.timestamp}`}</span>
              <span>{`ipHash: ${event.ipHash} · userAgentHash: ${event.userAgentHash}`}</span>
              <span>{`metadata: ${event.metadata}`}</span>
              <span>{`severity: ${event.severity}`}</span>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function MoatScreen() {
  const [tab, setTab] = useState("Competitive Landscape");
  const tabs = ["Competitive Landscape", "Whitespace", "Moat", "India GTM", "Roadmap"];

  return (
    <section className="stack">
      <div className="tabs">
        {tabs.map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item}</button>
        ))}
      </div>
      {tab === "Competitive Landscape" ? <CompetitiveLandscapeTab /> : null}
      {tab === "Whitespace" ? <WhitespaceTab /> : null}
      {tab === "Moat" ? <MoatTab /> : null}
      {tab === "India GTM" ? <IndiaGtmTab /> : null}
      {tab === "Roadmap" ? <RoadmapTab /> : null}
    </section>
  );
}

function CompetitiveLandscapeTab() {
  const columns: Array<[keyof CompetitiveProduct, string]> = [
    ["product", "Product"],
    ["behaviourAnalysis", "Behaviour analysis"],
    ["parentCoaching", "Parent coaching"],
    ["childSelfView", "Child self-view"],
    ["voiceConversationAnalysis", "Voice conversation analysis"],
    ["nlpConversationGraph", "NLP conversation graph"],
    ["therapistDashboard", "Therapist dashboard"],
    ["indiaLanguageSupport", "India language support"],
    ["longitudinalTracking", "Longitudinal tracking"],
    ["realTimeCoaching", "Real-time coaching"],
  ];

  return (
    <Panel title="Competitive Landscape">
      <p className="muted">Competitor capability to be verified. This table is configurable planning data, not a factual market claim.</p>
      <div className="comparison-table">
        <div className="comparison-header">{columns.map(([, label]) => <span key={label}>{label}</span>)}</div>
        {competitiveProducts.map((product) => (
          <div className="comparison-row" key={product.product}>
            {columns.map(([key]) => <span key={key}>{capabilityLabel(String(product[key]))}</span>)}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WhitespaceTab() {
  return (
    <section className="grid two">
      <Panel title="Observed Whitespace">
        <p>Market hypothesis: family communication products may leave space for a workflow that combines voice analysis, conversation graphs, parent coaching, child self-view, therapist review, and India-first localisation.</p>
      </Panel>
      <Panel title="Four-Layer Moat">
        <ol className="practice-list">{whitespaceLayers.map((layer) => <li key={layer}>{layer}</li>)}</ol>
      </Panel>
    </section>
  );
}

function MoatTab() {
  return (
    <section className="grid two">
      {whitespaceLayers.map((layer) => (
        <Panel title={layer} key={layer}>
          <p>Planned differentiation: build this layer as a product capability and validate it with users before making market claims.</p>
        </Panel>
      ))}
    </section>
  );
}

function IndiaGtmTab() {
  const [gtmPlan, setGtmPlan] = useState<{ executiveSummary: string; phases: Array<{ phase: string; actions: string[] }> } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [gtmError, setGtmError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true); setGtmError(null);
    try {
      const plan = await apiJson<{ executiveSummary: string; phases: Array<{ phase: string; actions: string[] }> }>("/api/strategy/generate-gtm-plan", {
        method: "POST",
        body: JSON.stringify({ targetMarket: "India", segments: indiaGtmSegments }),
      });
      setGtmPlan(plan);
    } catch (err) { setGtmError(err instanceof Error ? err.message : "Could not generate GTM plan."); }
    finally { setGenerating(false); }
  };

  return (
    <section className="stack">
      <section className="grid two">
        <Panel title="India GTM Segments">
          <div className="tag-row">{indiaGtmSegments.map((segment) => <span key={segment}>{segment}</span>)}</div>
          <p className="muted">Market hypothesis only. Segment priority should be validated through interviews and pilots.</p>
        </Panel>
        <Panel title="GTM Plan">
          {gtmError ? <div className="warning">{gtmError}</div> : null}
          <button className="secondary-action" type="button" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate GTM Plan"}
          </button>
          <p className="muted">Calls POST /api/strategy/generate-gtm-plan only after click. Output is cached.</p>
        </Panel>
      </section>
      {gtmPlan ? (
        <section className="stack">
          <Panel title="Executive Summary"><p>{gtmPlan.executiveSummary}</p></Panel>
          <section className="grid three">
            {gtmPlan.phases.map((phase) => (
              <Panel title={phase.phase} key={phase.phase}>
                <ul className="check-list">{phase.actions.map((action) => <li key={action}>{action}</li>)}</ul>
              </Panel>
            ))}
          </section>
        </section>
      ) : null}
    </section>
  );
}

function RoadmapTab() {
  return (
    <section className="grid three">
      {moatRoadmap.map((phase) => (
        <Panel title={phase.phase} key={phase.phase}>
          <ul className="check-list">{phase.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
      ))}
    </section>
  );
}

function capabilityLabel(value: string): string {
  if (value === "to-verify") {
    return "To verify";
  }
  if (value === "yes") {
    return "Yes";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LiveCoachScreen() {
  const settings = getLiveCoachSettings();
  const [paused, setPaused] = useState(false);
  const [transcriptLine, setTranscriptLine] = useState("Parent: You never listen, this is getting worse.");
  const simulation = simulateLiveCoach({
    transcriptLine,
    speaker: "parent",
    consentGranted: true,
  });

  return (
    <section className="stack">
      <div className="review-banner critical">
        <strong>Experimental future feature.</strong>
        <span>Disabled by default. No hidden recording, no child surveillance, and no diagnosis. Explicit consent and a visible recording indicator are required.</span>
      </div>
      <section className="grid three">
        <Panel title="Consent And Recording">
          <div className="recording-indicator"><span /> Recording indicator visible</div>
          <MetricRow label="Simulation mode" value="Default" />
          <MetricRow label="Live audio" value={settings.liveCoachAudioEnabled ? "Enabled by env" : "Disabled"} />
          <MetricRow label="Chunk duration" value={`${settings.chunkDurationSeconds}s`} />
        </Panel>
        <Panel title="Live Waveform Placeholder">
          <div className="waveform-placeholder"><span /><span /><span /><span /><span /><span /></div>
          <button className="danger-action" type="button" onClick={() => setPaused((p) => !p)}>{paused ? "Resume conversation" : "Pause conversation"}</button>
        </Panel>
        <Panel title="Current Detection">
          <MetricRow label="Detected pattern" value={simulation.detectedPattern.replaceAll("_", " ")} />
          <MetricRow label="Source" value={simulation.nudge?.source ?? "rule based"} />
          <MetricRow label="Severity" value={simulation.nudge?.severity ?? "low"} />
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Simulation Mode">
          <label>Typed transcript line<textarea value={transcriptLine} onChange={(e) => setTranscriptLine(e.target.value)} disabled={paused} /></label>
          <p className="muted">Rule-based detector runs locally/server-side and shows a coaching nudge in the UI.</p>
          <MetricRow label="Suggested parent nudge" value={simulation.nudge?.nudgeText ?? "No nudge needed"} />
        </Panel>
        <Panel title="Delayed Live Mode">
          <ul className="check-list">
            <li>Process short 10-15 second audio chunks.</li>
            <li>Browser audio chunks through WebSocket or Server-Sent Events.</li>
            <li>Cloud Run service with rule-based fast classifier first.</li>
            <li>No continuous storage unless user opts in.</li>
          </ul>
        </Panel>
      </section>
      <section className="grid two">
        <Panel title="Future Earpiece Mode">
          <p>Design only. Hardware integration is not implemented in MVP.</p>
          <p className="muted">Avoid sub-2-second LLM dependency for MVP due to cost and reliability.</p>
        </Panel>
        <Panel title="Session Summary After Live Coaching">
          <p>{simulation.sessionSummary}</p>
          <ul className="check-list">{liveCoachPrinciples.map((item) => <li key={item}>{item}</li>)}</ul>
        </Panel>
      </section>
      <Panel title="Cached Common Nudges">
        <section className="grid two">
          {liveCoachNudges.map((nudge) => (
            <article className="mini-card" key={nudge.id}>
              <strong>{nudge.triggerPattern.replaceAll("_", " ")}</strong>
              <span>{nudge.nudgeText}</span>
              <span>{nudge.target} · {nudge.severity} · {nudge.source}</span>
            </article>
          ))}
        </section>
      </Panel>
    </section>
  );
}

function SafetyConsentScreen() {
  return (
    <Panel title="Safety & Consent Principles">
      <ul className="check-list">{safetyPrinciples.map((principle) => <li key={principle}>{principle}</li>)}</ul>
    </Panel>
  );
}

function CostAdminScreen() {
  return (
    <Panel title="Low-Cost MVP Principles">
      <ul className="check-list">{costPrinciples.map((principle) => <li key={principle}>{principle}</li>)}</ul>
    </Panel>
  );
}

type CostMetric = {
  label: string;
  value: string | number;
  delta: string;
  tone: "green" | "yellow" | "red";
};

function AdminCostScreen({ role }: { role: AppRole }) {
  const snapshot = getCostDashboardSnapshot();
  const canChangeLimits = role === "super_admin";
  const [costSaved, setCostSaved] = useState(false);
  const metrics: CostMetric[] = [
    { label: "Sessions today", value: snapshot.sessionsProcessedToday, delta: "Within trial range", tone: "green" },
    { label: "Sessions this month", value: snapshot.sessionsProcessedToday * 14, delta: "Usage rising", tone: "yellow" },
    { label: "Transcript-only sessions", value: 18, delta: "Cost efficient", tone: "green" },
    { label: "Live audio sessions", value: 7, delta: "Higher STT spend", tone: "yellow" },
    { label: "Uploaded transient audio sessions", value: 5, delta: "No raw storage", tone: "green" },
    { label: "STT minutes today", value: snapshot.totalAudioMinutesProcessed, delta: "Watch duration", tone: "yellow" },
    { label: "STT minutes this month", value: snapshot.totalAudioMinutesProcessed * 12, delta: "Approaching budget", tone: "yellow" },
    { label: "Gemini calls today", value: snapshot.aiCallsToday, delta: "User-triggered only", tone: "green" },
    { label: "Gemini calls this month", value: snapshot.aiCallsToday * 18, delta: "Reuse cache aggressively", tone: "yellow" },
    { label: "Cached analysis reuse count", value: 64, delta: "Good reuse rate", tone: "green" },
    { label: "Firestore reads estimate", value: 5200, delta: "Keep queries narrow", tone: "yellow" },
    { label: "Firestore writes estimate", value: 870, delta: "Mostly event writes", tone: "green" },
    { label: "Cloud Run request count estimate", value: 2400, delta: "Keep pages lean", tone: "yellow" },
    { label: "Estimated monthly cost placeholder", value: "$42.00", delta: "Target under trial budget", tone: "green" },
  ];

  const defaultControls = [
    { label: "MAX_AUDIO_DURATION_SECONDS", value: String(snapshot.guardrails.maxAudioDurationSeconds), help: "Keep recordings short to cap STT cost." },
    { label: "MAX_AUDIO_FILE_MB", value: String(snapshot.guardrails.maxAudioFileMb), help: "Reject oversized uploads early." },
    { label: "DAILY_SESSION_LIMIT_PER_FAMILY", value: String(snapshot.guardrails.dailyAnalysisLimitPerFamily), help: "Prevents runaway usage." },
    { label: "DAILY_STT_MINUTES_LIMIT", value: "30", help: "Protects speech-to-text spend." },
    { label: "DAILY_GEMINI_CALL_LIMIT", value: "20", help: "Prevents analysis spikes." },
  ];
  const defaultToggles = [
    { label: "FORCE_TRANSCRIPT_ONLY_MODE", checked: false, description: "Prefer transcript uploads to avoid transcription." },
    { label: "DISABLE_REAL_AI", checked: snapshot.guardrails.disableRealAi, description: "Keep production AI disabled until explicitly enabled." },
    { label: "ENABLE_MOCK_MODE", checked: snapshot.guardrails.useMockTranscription, description: "Use local demo data and stubbed services." },
    { label: "ENABLE_LIVE_COACH=false", checked: false, description: "Keep live coaching off for MVP." },
  ];
  const [controls, setControls] = useState(defaultControls);
  const [toggles, setToggles] = useState(defaultToggles);

  return (
    <section className="stack">
      <section className="grid four cost-alert-grid">
        {metrics.map((metric) => (
          <article className={`cost-alert-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.delta}</p>
          </article>
        ))}
      </section>
      <section className="grid two">
        <Panel title="Platform Limits">
          <p className="muted">
            Only super_admin can change limits. clinical_admin can view this page but controls stay read-only.
          </p>
          <div className="cost-control-list">
            {controls.map((control) => (
              <label className="cost-control-row" key={control.label}>
                <span>
                  <strong>{control.label}</strong>
                  <small>{control.help}</small>
                </span>
                <input value={control.value} onChange={(e) => setControls((cs) => cs.map((c) => c.label === control.label ? { ...c, value: e.target.value } : c))} disabled={!canChangeLimits} inputMode="numeric" />
              </label>
            ))}
          </div>
          <div className="cost-toggle-list">
            {toggles.map((toggle) => (
              <label className="cost-toggle-row" key={toggle.label}>
                <span>
                  <strong>{toggle.label}</strong>
                  <small>{toggle.description}</small>
                </span>
                <input type="checkbox" checked={toggle.checked} onChange={(e) => setToggles((ts) => ts.map((t) => t.label === toggle.label ? { ...t, checked: e.target.checked } : t))} disabled={!canChangeLimits} />
              </label>
            ))}
          </div>
          {costSaved ? <div className="success-banner">Platform limits saved.</div> : null}
          <div className="action-row">
            <button className="secondary-action" type="button" disabled={!canChangeLimits} onClick={async () => {
              await apiJson("/api/admin/cost-limits", {
                method: "POST",
                headers: { "x-user-id": "user_super_admin_1", "x-user-role": role },
                body: JSON.stringify({ controls, toggles }),
              }).catch(() => {});
              setCostSaved(true); setTimeout(() => setCostSaved(false), 2500);
            }}>
              Save platform limits
            </button>
            <button className="secondary-action" type="button" disabled={!canChangeLimits} onClick={() => { setControls(defaultControls); setToggles(defaultToggles); setCostSaved(false); }}>
              Reset to safe defaults
            </button>
          </div>
        </Panel>
        <Panel title="Cost Guardrail Alerts">
          <section className="cost-alert-summary">
            <article className="cost-state-card green">
              <strong>Green</strong>
              <p>Within free-tier-friendly usage.</p>
            </article>
            <article className="cost-state-card yellow">
              <strong>Yellow</strong>
              <p>Usage is rising and should be watched daily.</p>
            </article>
            <article className="cost-state-card red">
              <strong>Red</strong>
              <p>Cost risk is high and limits should tighten immediately.</p>
            </article>
          </section>
          {snapshot.familiesOverDailyLimit.length === 0 ? (
            <p className="muted">No family is over the daily analysis limit.</p>
          ) : (
            snapshot.familiesOverDailyLimit.map((family) => (
              <MetricRow key={family.familyId} label={family.familyId} value={`${family.analysisCount}/${family.limit}`} />
            ))
          )}
          <p className="muted">Firestore, Cloud Run, and Gemini estimates are placeholders for cost planning until billing telemetry is wired in.</p>
        </Panel>
      </section>
      <Panel title="Recommendations">
        <ul className="check-list">
          <li>Prefer transcript upload where possible.</li>
          <li>Do not store raw audio.</li>
          <li>Use rule-based analysis first.</li>
          <li>Cache Gemini output.</li>
          <li>Disable live coaching for MVP.</li>
          <li>Keep Redis, BigQuery, and Cloud SQL disabled until scale requires them.</li>
        </ul>
      </Panel>
    </section>
  );
}

function IntakeCards({ active }: { active?: "record" | "audio" | "transcript" }) {
  const cards = [
    {
      id: "record",
      title: "Record Now",
      body: "Start a guided 2-5 minute consented family conversation inside the app.",
      path: "/record",
    },
    {
      id: "audio",
      title: "Upload Voice File",
      body: "Use an existing mobile recorder file and validate size, format, and duration.",
      path: "/upload-audio",
    },
    {
      id: "transcript",
      title: "Paste / Upload Transcript",
      body: "Faster and cheaper because AI does not need to transcribe audio.",
      path: "/upload-transcript",
    },
  ];

  return (
    <section className="intake-grid">
      {cards.map((card) => (
        <a className={active === card.id ? "intake-card active" : "intake-card"} href={card.path} key={card.id}>
          <strong>{card.title}</strong>
          <span>{card.body}</span>
        </a>
      ))}
    </section>
  );
}

function HistorySessionRow({ session }: { session: HistorySession }) {
  return (
    <article className="history-row">
      <span>{session.date}</span>
      <span>{session.child}</span>
      <span>{session.situation}</span>
      <span>{session.language}</span>
      <span className={`risk-chip ${session.riskLevel}`}>{session.riskLevel}</span>
      <span>{session.parentCoachingFocus}</span>
      <span>{session.childCoachingFocus}</span>
      <span>{session.repairScore}/100</span>
      <span>{session.escalationRisk}%</span>
      <span>{session.status.replaceAll("-", " ")}</span>
      <span className="table-actions">
        <a href="/conversation-graph">View Graph</a>
        <a href={`/sessions/${session.id}/parent`}>Parent Coaching</a>
        <a href={`/sessions/${session.id}/child`}>Child Coaching</a>
        <a href={`/therapist/sessions/${session.id}`}>Therapist Summary</a>
      </span>
    </article>
  );
}

function TrendMetricCard({ title, previous, current, note }: { title: string; previous: string; current: string; note: string }) {
  return (
    <Panel title={title}>
      <MetricRow label="Previous" value={previous} />
      <MetricRow label="Current" value={current} />
      <p>{note}</p>
    </Panel>
  );
}

function ProgressLineChart({
  title,
  points,
  valueKey,
  format = (value) => String(Math.round(value)),
}: {
  title: string;
  points: LongitudinalTrendPoint[];
  valueKey: keyof Pick<LongitudinalTrendPoint, "escalationRate" | "parentValidationScore" | "childRegulationScore" | "repairScore">;
  format?: (value: number) => string;
}) {
  const values = points.map((point) => Number(point[valueKey]));
  const max = Math.max(...values);

  return (
    <Panel title={title}>
      <div className="simple-chart">
        {points.map((point) => {
          const value = Number(point[valueKey]);
          return (
            <div className="chart-point" key={`${title}-${point.sessionId}`}>
              <span style={{ height: `${Math.max((value / max) * 100, 8)}%` }}>{format(value)}</span>
              <small>{point.date.slice(5)}</small>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function TriggerFrequencyChart({ triggerCounts }: { triggerCounts: Record<string, number> }) {
  return (
    <Panel title="Top Triggers This Month">
      <div className="trigger-bars">
        {Object.entries(triggerCounts).map(([trigger, count]) => (
          <div key={trigger}>
            <span>{trigger}</span>
            <div><strong style={{ width: `${count * 18}%` }}>{count}</strong></div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MonthlyInsightCard({
  title,
  type,
  explanation,
  recommendedNextStep,
}: {
  title: string;
  type: string;
  explanation: string;
  recommendedNextStep: string;
}) {
  return (
    <Panel title={title}>
      <span className="cache-badge cached">{type}</span>
      <p>{explanation}</p>
      <p className="muted">{recommendedNextStep}</p>
    </Panel>
  );
}

function FamilyFocusCard({ familyId = "family-demo-1", childId = "child_demo_1" }: { familyId?: string; childId?: string }) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<{ focusSuggestion?: string; topTriggers?: string[]; periodLabel?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateInsight() {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 28);
      const data = await apiJson<{ snapshot: { topTriggers: string[] }; insights: Array<{ title: string }> }>("/api/history/generate-trend-snapshot", {
        method: "POST",
        body: JSON.stringify({
          familyId,
          childId,
          periodType: "monthly",
          periodStart: start.toISOString(),
          periodEnd: now.toISOString(),
        }),
      });
      setInsight({
        focusSuggestion: data.insights[0]?.title ?? "Keep homework starts small: one validation sentence, one clear boundary, one next step.",
        topTriggers: data.snapshot?.topTriggers ?? [],
        periodLabel: `${start.toLocaleDateString()} – ${now.toLocaleDateString()}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate insight.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Recommended Next Family Focus">
      {insight ? (
        <>
          <p>{insight.focusSuggestion}</p>
          {insight.topTriggers && insight.topTriggers.length > 0 && (
            <div className="tag-row">{insight.topTriggers.map((t) => <span key={t}>{t}</span>)}</div>
          )}
          <MetricRow label="Period" value={insight.periodLabel ?? ""} />
        </>
      ) : (
        <p className="muted">Click below to generate a deeper family focus insight from recent session data.</p>
      )}
      {error ? <div className="warning">{error}</div> : null}
      <button className="secondary-action" type="button" onClick={() => void generateInsight()} disabled={loading}>
        {loading ? "Generating..." : insight ? "Regenerate insight" : "Generate deeper family insight"}
      </button>
      <MetricRow label="Source collection" value="SessionMetric / FamilyTrendSnapshot" />
      <p className="muted">Insight is deterministic from stored session metrics. Not an AI diagnosis.</p>
    </Panel>
  );
}

function countTriggers(points: LongitudinalTrendPoint[]): Record<string, number> {
  return points.reduce<Record<string, number>>((result, point) => {
    result[point.trigger] = (result[point.trigger] ?? 0) + 1;
    return result;
  }, {});
}

function ParentPatternCard({ patterns }: { patterns: string[] }) {
  return (
    <Panel title="Parent Response Pattern Summary">
      <div className="tag-row">
        {patterns.map((pattern) => (
          <span key={pattern}>{pattern}</span>
        ))}
      </div>
      <p className="muted">Patterns describe communication moments, not parent identity or mental health.</p>
    </Panel>
  );
}

function ParentCoachingScoreCard({ scores }: { scores: Array<{ label: string; value: number }> }) {
  return (
    <Panel title="Parent Coaching Need Score">
      {scores.map((score) => (
        <div className="score-row" key={score.label}>
          <MetricRow label={score.label} value={`${score.value}/100`} />
          <div className="score-track">
            <div style={{ width: `${score.value}%` }} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

function PhraseComparisonCard({
  original,
  detected,
  impact,
  better,
}: {
  original: string;
  detected: string;
  impact: string;
  better: string;
}) {
  return (
    <Panel title="What Went Wrong">
      <section className="grid four">
        <div className="comparison-cell"><strong>Original</strong><p>{original}</p></div>
        <div className="comparison-cell"><strong>Detected</strong><p>{detected}</p></div>
        <div className="comparison-cell"><strong>Impact</strong><p>{impact}</p></div>
        <div className="comparison-cell"><strong>Better</strong><p>{better}</p></div>
      </section>
    </Panel>
  );
}

function ParentScriptBuilder({ sessionId = "session-demo" }: { sessionId?: string }) {
  const [script, setScript] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await apiJson<{ output: string }>(`/api/sessions/${sessionId}/ai/personalize`, {
        method: "POST",
        headers: { "x-user-id": "parent_demo_1", "x-user-role": "parent" },
        body: JSON.stringify({ purpose: "parent_script", familyId: "family-demo-1" }),
      });
      setScript(result.output);
    } catch {
      setScript("Observe: I see this is hard right now.\nValidate: It makes sense you feel frustrated.\nBoundary: We still need to move forward together.\nSmall next step: Let's pick just one thing to try.");
    } finally { setGenerating(false); }
  };

  return (
    <Panel title="Better Parent Script Generator">
      <div className="script-formula">
        <span>Observe</span>
        <span>Validate</span>
        <span>Boundary</span>
        <span>Small Next Step</span>
      </div>
      <pre className="sample-block">{script ?? `Observe: I see the homework is incomplete.\nValidate: It looks hard to get started.\nBoundary: We still need ten focused minutes.\nSmall next step: Choose the first question or read the instructions aloud.`}</pre>
      <button className="secondary-action" type="button" onClick={generate} disabled={generating}>
        {generating ? "Generating…" : "Generate personalized script"}
      </button>
      <p className="muted">The first script is rule-based. Personalized generation calls Gemini only after click and caches the output.</p>
    </Panel>
  );
}

function PracticePlanCard({ items }: { items: string[] }) {
  return (
    <Panel title="7-Day Parent Practice Plan">
      <ol className="practice-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </Panel>
  );
}

function ProfessionalReviewBanner({ recommended, reason }: { recommended: boolean; reason: string }) {
  return (
    <div className={recommended ? "review-banner critical" : "review-banner"}>
      <strong>{recommended ? "Professional review recommended" : "Parent risk safety boundary"}</strong>
      <span>{reason}</span>
    </div>
  );
}

function SafetyReviewBanner({ assessment }: { assessment: RiskAssessment }) {
  const labelByLevel: Record<RiskAssessment["riskLevel"], string> = {
    low: "Normal coaching",
    medium: "Parent attention suggested",
    high: "Professional review recommended",
    critical: "Immediate safety guidance",
  };

  return (
    <div className={`safety-banner ${assessment.riskLevel}`}>
      <strong>{labelByLevel[assessment.riskLevel]}</strong>
      <span>This conversation contains concerning language that may require immediate adult or professional attention.</span>
      <span>{assessment.explanation}</span>
    </div>
  );
}

function ReactRespondFlow() {
  return (
    <Panel title="React vs Respond Path">
      <section className="grid two">
        <div className="path-panel react">
          <strong>React</strong>
          <div className="path-flow"><span>Trigger</span><span>Big feeling</span><span>Fast words</span><span>Problem grows</span></div>
        </div>
        <div className="path-panel respond">
          <strong>Respond</strong>
          <div className="path-flow"><span>Trigger</span><span>Pause</span><span>Name feeling</span><span>Ask for help</span><span>Problem becomes smaller</span></div>
        </div>
      </section>
    </Panel>
  );
}

function FeelingCards({ feelings }: { feelings: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Panel title="Feeling Finder">
      {selected ? <div className="global-banner">I feel {selected}. That is okay.</div> : null}
      <div className="feeling-grid">
        {feelings.map((feeling) => (
          <button key={feeling} type="button" className={selected === feeling ? "active" : ""} onClick={() => setSelected(feeling === selected ? null : feeling)}>{feeling}</button>
        ))}
      </div>
      <p className="muted">Tap a feeling to name it. Naming a feeling helps make it smaller.</p>
    </Panel>
  );
}

function SentenceBuilder() {
  return (
    <Panel title="Better Sentence Builder">
      <div className="sentence-formula">
        <span>I feel ____</span>
        <span>because ____</span>
        <span>I need ____</span>
        <span>Can we ____?</span>
      </div>
      <pre className="sample-block">I feel frustrated because the question is hard. I need help starting. Can we do one together?</pre>
    </Panel>
  );
}

function ReflectionCard({ prompt }: { prompt: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (!text.trim()) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <article className="reflection-card">
      <strong>{prompt}</strong>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} placeholder="Write a short answer." />
      {saved
        ? <span className="muted">Saved ✓</span>
        : <button className="secondary-action" type="button" onClick={save} disabled={!text.trim()}>Save</button>}
    </article>
  );
}

function PracticeScenarioCard({
  situation,
  badReactionOption,
  betterResponseOption,
  whyBetterResponseHelps,
}: {
  situation: string;
  badReactionOption: string;
  betterResponseOption: string;
  whyBetterResponseHelps: string;
}) {
  return (
    <article className="scenario-card">
      <strong>{situation}</strong>
      <MetricRow label="Fast reaction" value={badReactionOption} />
      <MetricRow label="Better response" value={betterResponseOption} />
      <p>{whyBetterResponseHelps}</p>
    </article>
  );
}

function BadgeProgress({ badges }: { badges: string[] }) {
  return (
    <Panel title="Kid Progress Badges">
      <div className="badge-row">
        {badges.map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
      </div>
      <p className="muted">Badges notice helpful skills. They do not label the child.</p>
    </Panel>
  );
}

function SessionList({ items }: { items: Session[] }) {
  return (
    <section className="grid two">
      {items.map((session) => (
        <Panel title={session.title} key={session.id}>
          <MetricRow label="Language" value={session.language} />
          <MetricRow label="Source" value={session.source} />
          <MetricRow label="Escalation rate" value={`${Math.round(session.metric.escalationRate * 100)}%`} />
          <p>{session.summary}</p>
          <div className="tag-row">
            {session.coachingOpportunities.map((item) => <span key={item}>{item}</span>)}
          </div>
        </Panel>
      ))}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Node({ label }: { label: string }) {
  return <div className="graph-node">{label}</div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
