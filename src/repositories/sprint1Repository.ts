import {
  consentRecordSchema,
  conversationNodeSchema,
  conversationSessionSchema,
  conversationTurnSchema,
  familyTrendSnapshotSchema,
  languagePreferenceSchema,
  recommendationSchema,
  sessionMetricSchema,
  therapistNoteSchema,
  transcriptUploadSchema,
  audioUploadSchema,
  audioProcessingEventSchema,
  auditLogSchema,
  costUsageEventSchema,
  promptVersionSchema,
  rolePermissionSchema,
  safetyRuleSchema,
  therapistAssignmentSchema,
  type AudioUpload,
  type AudioProcessingEvent,
  type AuditLog,
  type ConsentRecord,
  type ConversationNode,
  type ConversationSession,
  type ConversationTurn,
  type CreateConsentRecordInput,
  type CreateSessionInput,
  type CreateTherapistNoteInput,
  type CostUsageEvent,
  type FamilyTrendSnapshot,
  type LanguagePreference,
  type PeriodType,
  type PromptVersion,
  type Recommendation,
  type RolePermission,
  type SaveLanguagePreferenceInput,
  type SaveAudioUploadInput,
  type SaveSessionMetricInput,
  type SaveTranscriptUploadInput,
  type SafetyRule,
  type SessionMetric,
  type TherapistAssignment,
  type TherapistNote,
  type TranscriptUpload,
} from "../types/sprint1";
import type { Sprint1StorageAdapter } from "./storageAdapter";
import { randomUUID } from "node:crypto";
import { storeAudioUpload } from "../services/cloudStorageService";
import type { ChildAnalysis, ChildReflection } from "../services/childCoaching";
import type { ParentAnalysis } from "../services/parentCoaching";
import type {
  AssignedPracticeRecord,
  ProfessionalNoteRecord,
  TherapistAuditEvent,
  TherapistExportSummary,
} from "../services/therapistDashboard";
import type { RiskAssessment } from "../services/safetyRiskClassifier";
import type { PrivacyAuditEvent, PrivacyExportBundle } from "../services/privacyControls";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
type SessionScopedInput<T extends { sessionId: string }> = Omit<T, "sessionId"> & Partial<Pick<T, "sessionId">>;

export class Sprint1Repository {
  constructor(private readonly storage: Sprint1StorageAdapter) {}

  async createSession(input: CreateSessionInput): Promise<ConversationSession> {
    const timestamp = now();
    const session = conversationSessionSchema.parse({
      ...input,
      id: id("session"),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.storage.setJson(sessionKey(session.id), session);
    await this.storage.addToSet(familySessionsKey(session.familyId), session.id);
    return session;
  }

  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const session = await this.storage.getJson<ConversationSession>(sessionKey(sessionId));
    return session ? conversationSessionSchema.parse(session) : null;
  }

  async listSessionsByFamily(familyId: string): Promise<ConversationSession[]> {
    const sessionIds = await this.storage.members(familySessionsKey(familyId));
    const sessions = await Promise.all(sessionIds.map((sessionId) => this.getSession(sessionId)));
    return sessions.filter((session): session is ConversationSession => Boolean(session));
  }

  async saveTranscriptTurns(
    sessionId: string,
    turns: SessionScopedInput<ConversationTurn>[],
  ): Promise<ConversationTurn[]> {
    const parsedTurns = turns.map((turn) => conversationTurnSchema.parse({ ...turn, sessionId }));
    await this.storage.setJson(turnsKey(sessionId), parsedTurns);
    await this.markSessionUpdated(sessionId, "transcribed");
    return parsedTurns;
  }

  async getTranscriptTurns(sessionId: string): Promise<ConversationTurn[]> {
    const turns = await this.storage.getJson<ConversationTurn[]>(turnsKey(sessionId));
    return turns ? turns.map((turn) => conversationTurnSchema.parse(turn)) : [];
  }

  async saveConversationNodes(
    sessionId: string,
    nodes: SessionScopedInput<ConversationNode>[],
  ): Promise<ConversationNode[]> {
    const parsedNodes = nodes.map((node) => conversationNodeSchema.parse({ ...node, sessionId }));
    await this.storage.setJson(nodesKey(sessionId), parsedNodes);
    return parsedNodes;
  }

  async getConversationNodes(sessionId: string): Promise<ConversationNode[]> {
    const nodes = await this.storage.getJson<ConversationNode[]>(nodesKey(sessionId));
    return nodes ? nodes.map((node) => conversationNodeSchema.parse(node)) : [];
  }

  async saveRecommendations(
    sessionId: string,
    recommendations: SessionScopedInput<Recommendation>[],
  ): Promise<Recommendation[]> {
    const parsedRecommendations = recommendations.map((recommendation) =>
      recommendationSchema.parse({ ...recommendation, sessionId }),
    );
    await this.storage.setJson(recommendationsKey(sessionId), parsedRecommendations);
    await this.markSessionUpdated(sessionId, "analyzed");
    return parsedRecommendations;
  }

  async createConsentRecord(input: CreateConsentRecordInput): Promise<ConsentRecord> {
    const consent = consentRecordSchema.parse({
      ...input,
      id: id("consent"),
      status: "granted",
      grantedAt: now(),
    });

    await this.storage.setJson(consentKey(consent.id), consent);
    await this.storage.addToSet(familyConsentKey(consent.familyId), consent.id);
    return consent;
  }

  async revokeConsent(consentId: string): Promise<ConsentRecord | null> {
    const current = await this.storage.getJson<ConsentRecord>(consentKey(consentId));
    if (!current) {
      return null;
    }

    const revoked = consentRecordSchema.parse({
      ...current,
      status: "revoked",
      revokedAt: now(),
    });
    await this.storage.setJson(consentKey(consentId), revoked);
    return revoked;
  }

  async listConsentsByFamily(familyId: string): Promise<ConsentRecord[]> {
    const consentIds = await this.storage.members(familyConsentKey(familyId));
    const consents = await Promise.all(consentIds.map((consentId) => this.storage.getJson<ConsentRecord>(consentKey(consentId))));
    return consents
      .filter((consent): consent is ConsentRecord => Boolean(consent))
      .map((consent) => consentRecordSchema.parse(consent))
      .sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
  }

  async createTherapistNote(input: CreateTherapistNoteInput): Promise<TherapistNote> {
    const note = therapistNoteSchema.parse({
      ...input,
      id: id("therapist_note"),
      createdAt: now(),
    });

    await this.storage.setJson(therapistNoteKey(note.id), note);
    await this.storage.addToSet(sessionTherapistNotesKey(note.sessionId), note.id);
    return note;
  }

  async saveSessionMetrics(metrics: SaveSessionMetricInput[]): Promise<SessionMetric[]> {
    const parsedMetrics = metrics.map((metric) =>
      sessionMetricSchema.parse({
        ...metric,
        id: id("metric"),
        createdAt: now(),
      }),
    );

    await Promise.all(
      parsedMetrics.map(async (metric) => {
        await this.storage.setJson(sessionMetricKey(metric.id), metric);
        await this.storage.addToSet(sessionMetricsKey(metric.sessionId), metric.id);
        await this.storage.addToSet(childHistoryKey(metric.familyId, metric.childId), metric.id);
      }),
    );

    return parsedMetrics;
  }

  async getSessionHistoryByChild(familyId: string, childId: string): Promise<SessionMetric[]> {
    const metricIds = await this.storage.members(childHistoryKey(familyId, childId));
    const metrics = await Promise.all(
      metricIds.map(async (metricId) => this.storage.getJson<SessionMetric>(sessionMetricKey(metricId))),
    );

    return metrics
      .filter((metric): metric is SessionMetric => Boolean(metric))
      .map((metric) => sessionMetricSchema.parse(metric))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getFamilyTrendSnapshot(
    familyId: string,
    childId: string,
    periodType: PeriodType,
  ): Promise<FamilyTrendSnapshot | null> {
    const snapshotId = await this.storage.getJson<string>(latestTrendSnapshotKey(familyId, childId, periodType));
    if (!snapshotId) {
      return null;
    }

    const snapshot = await this.storage.getJson<FamilyTrendSnapshot>(familyTrendSnapshotKey(snapshotId));
    return snapshot ? familyTrendSnapshotSchema.parse(snapshot) : null;
  }

  async generateTrendSnapshot(
    familyId: string,
    childId: string,
    periodType: PeriodType,
    periodStart: string,
    periodEnd: string,
  ): Promise<FamilyTrendSnapshot> {
    const metrics = (await this.getSessionHistoryByChild(familyId, childId)).filter(
      (metric) => metric.createdAt >= periodStart && metric.createdAt <= periodEnd,
    );
    const snapshot = familyTrendSnapshotSchema.parse({
      id: id("trend"),
      familyId,
      childId,
      periodType,
      periodStart,
      periodEnd,
      sessionCount: metrics.length,
      topTriggers: topTags(metrics.flatMap((metric) => metric.triggerTags)),
      parentEscalationAverage: average(metrics.map((metric) => metric.parentEscalationScore)),
      parentValidationAverage: average(metrics.map((metric) => metric.parentValidationScore)),
      childRegulationAverage: average(metrics.map((metric) => metric.childRegulationScore)),
      repairScoreAverage: average(metrics.map((metric) => metric.repairScore)),
      ...growthSummary(metrics),
    });

    await this.storage.setJson(familyTrendSnapshotKey(snapshot.id), snapshot);
    await this.storage.setJson(latestTrendSnapshotKey(familyId, childId, periodType), snapshot.id);
    return snapshot;
  }

  async saveLanguagePreference(input: SaveLanguagePreferenceInput): Promise<LanguagePreference> {
    const preference = languagePreferenceSchema.parse({
      ...input,
      id: id("language_preference"),
    });

    await this.storage.setJson(languagePreferenceKey(preference.id), preference);
    await this.storage.setJson(userLanguagePreferenceKey(preference.familyId, preference.userId), preference.id);
    return preference;
  }

  async saveTranscriptUpload(input: SaveTranscriptUploadInput): Promise<TranscriptUpload> {
    const upload = transcriptUploadSchema.parse({
      ...input,
      id: id("transcript_upload"),
      createdAt: now(),
    });

    await this.storage.setJson(transcriptUploadKey(upload.id), upload);
    await this.storage.addToSet(sessionTranscriptUploadsKey(upload.sessionId), upload.id);
    return upload;
  }

  async saveAudioUpload(input: SaveAudioUploadInput): Promise<AudioUpload> {
    const stored = await storeAudioUpload(input);
    const upload = audioUploadSchema.parse({
      ...input,
      id: id("audio_upload"),
      storagePath: stored.storagePath,
      retentionDays: stored.retentionDays,
      audioPersisted: stored.audioPersisted,
      createdAt: now(),
    });
    const event = audioProcessingEventSchema.parse({
      id: id("audio_processing"),
      sessionId: upload.sessionId,
      inputMode: "uploaded_audio_transient",
      fileName: upload.fileName,
      audioPersisted: upload.audioPersisted,
      storagePath: upload.storagePath,
      provider: process.env.USE_MOCK_TRANSCRIPTION === "false" ? "speech_to_text" : "mock",
      status: upload.audioPersisted ? "received" : "discarded",
      createdAt: now(),
    });

    await this.storage.setJson(audioUploadKey(upload.id), upload);
    await this.storage.addToSet(sessionAudioUploadsKey(upload.sessionId), upload.id);
    await this.saveAudioProcessingEvent(event);
    await this.markSessionAudioUploaded(upload.sessionId, upload.storagePath);
    return upload;
  }

  async saveAudioProcessingEvent(event: AudioProcessingEvent): Promise<AudioProcessingEvent> {
    const parsed = audioProcessingEventSchema.parse(event);
    await this.storage.setJson(audioProcessingEventKey(parsed.id), parsed);
    await this.storage.addToSet(sessionAudioProcessingEventsKey(parsed.sessionId), parsed.id);
    return parsed;
  }

  async saveRolePermission(permission: RolePermission): Promise<RolePermission> {
    const parsed = rolePermissionSchema.parse(permission);
    await this.storage.setJson(rolePermissionKey(parsed.id), parsed);
    await this.storage.addToSet(rolePermissionsKey(parsed.role), parsed.id);
    return parsed;
  }

  async listRolePermissions(role: RolePermission["role"]): Promise<RolePermission[]> {
    const permissionIds = await this.storage.members(rolePermissionsKey(role));
    const permissions = await Promise.all(
      permissionIds.map((permissionId) => this.storage.getJson<RolePermission>(rolePermissionKey(permissionId))),
    );
    return permissions
      .filter((permission): permission is RolePermission => Boolean(permission))
      .map((permission) => rolePermissionSchema.parse(permission));
  }

  async savePromptVersion(prompt: PromptVersion): Promise<PromptVersion> {
    const parsed = promptVersionSchema.parse(prompt);
    await this.storage.setJson(promptVersionKey(parsed.id), parsed);
    await this.storage.addToSet(promptVersionsKey(parsed.language), parsed.id);
    return parsed;
  }

  async listPromptVersions(language: PromptVersion["language"]): Promise<PromptVersion[]> {
    const promptIds = await this.storage.members(promptVersionsKey(language));
    const prompts = await Promise.all(
      promptIds.map((promptId) => this.storage.getJson<PromptVersion>(promptVersionKey(promptId))),
    );
    return prompts
      .filter((prompt): prompt is PromptVersion => Boolean(prompt))
      .map((prompt) => promptVersionSchema.parse(prompt));
  }

  async saveSafetyRule(rule: SafetyRule): Promise<SafetyRule> {
    const parsed = safetyRuleSchema.parse(rule);
    await this.storage.setJson(safetyRuleKey(parsed.id), parsed);
    await this.storage.addToSet(safetyRulesKey(parsed.language, parsed.category), parsed.id);
    return parsed;
  }

  async listSafetyRules(language: SafetyRule["language"], category: SafetyRule["category"]): Promise<SafetyRule[]> {
    const ruleIds = await this.storage.members(safetyRulesKey(language, category));
    const rules = await Promise.all(ruleIds.map((ruleId) => this.storage.getJson<SafetyRule>(safetyRuleKey(ruleId))));
    return rules
      .filter((rule): rule is SafetyRule => Boolean(rule))
      .map((rule) => safetyRuleSchema.parse(rule));
  }

  async saveAuditLog(event: AuditLog): Promise<AuditLog> {
    const parsed = auditLogSchema.parse(event);
    await this.storage.setJson(auditLogKey(parsed.id), parsed);
    await this.storage.addToSet(auditLogsByActorKey(parsed.actorUserId), parsed.id);
    return parsed;
  }

  async saveCostUsageEvent(event: CostUsageEvent): Promise<CostUsageEvent> {
    const parsed = costUsageEventSchema.parse(event);
    await this.storage.setJson(costUsageEventKey(parsed.id), parsed);
    await this.storage.addToSet(costUsageEventsByFamilyKey(parsed.familyId), parsed.id);
    return parsed;
  }

  async saveTherapistAssignment(assignment: TherapistAssignment): Promise<TherapistAssignment> {
    const parsed = therapistAssignmentSchema.parse(assignment);
    await this.storage.setJson(therapistAssignmentKey(parsed.id), parsed);
    await this.storage.addToSet(therapistAssignmentsByFamilyKey(parsed.familyId), parsed.id);
    await this.storage.addToSet(therapistAssignmentsByUserKey(parsed.therapistUserId), parsed.id);
    return parsed;
  }

  async getProcessingStatus(sessionId: string): Promise<{
    sessionId: string;
    transcriptStatus: ConversationSession["transcriptStatus"];
    riskLevel: ConversationSession["riskLevel"];
    hasAudioUpload: boolean;
    hasTranscriptUpload: boolean;
  } | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const audioUploadIds = await this.storage.members(sessionAudioUploadsKey(sessionId));
    const transcriptUploadIds = await this.storage.members(sessionTranscriptUploadsKey(sessionId));
    return {
      sessionId,
      transcriptStatus: session.transcriptStatus,
      riskLevel: session.riskLevel,
      hasAudioUpload: audioUploadIds.length > 0,
      hasTranscriptUpload: transcriptUploadIds.length > 0,
    };
  }

  async getParentAnalysis(sessionId: string): Promise<ParentAnalysis | null> {
    return this.storage.getJson<ParentAnalysis>(parentAnalysisKey(sessionId));
  }

  async saveParentAnalysis(analysis: ParentAnalysis): Promise<ParentAnalysis> {
    await this.storage.setJson(parentAnalysisKey(analysis.sessionId), analysis);
    return analysis;
  }

  async saveParentPracticePlan(sessionId: string, practicePlan: string[]): Promise<string[]> {
    await this.storage.setJson(parentPracticePlanKey(sessionId), practicePlan);
    return practicePlan;
  }

  async getChildAnalysis(sessionId: string): Promise<ChildAnalysis | null> {
    return this.storage.getJson<ChildAnalysis>(childAnalysisKey(sessionId));
  }

  async saveChildAnalysis(analysis: ChildAnalysis): Promise<ChildAnalysis> {
    await this.storage.setJson(childAnalysisKey(analysis.sessionId), analysis);
    return analysis;
  }

  async saveChildReflection(sessionId: string, reflection: ChildReflection): Promise<ChildReflection> {
    await this.storage.setJson(childReflectionKey(sessionId), reflection);
    return reflection;
  }

  async saveProfessionalNote(note: ProfessionalNoteRecord): Promise<ProfessionalNoteRecord> {
    await this.storage.setJson(professionalNoteKey(note.id), note);
    await this.storage.addToSet(sessionProfessionalNotesKey(note.sessionId), note.id);
    return note;
  }

  async saveAssignedPractice(practice: AssignedPracticeRecord): Promise<AssignedPracticeRecord> {
    await this.storage.setJson(assignedPracticeKey(practice.id), practice);
    await this.storage.addToSet(sessionAssignedPracticeKey(practice.sessionId), practice.id);
    return practice;
  }

  async saveTherapistAuditEvent(event: TherapistAuditEvent): Promise<TherapistAuditEvent> {
    await this.storage.setJson(therapistAuditEventKey(event.id), event);
    if (event.sessionId) {
      await this.storage.addToSet(sessionTherapistAuditKey(event.sessionId), event.id);
    }
    if (event.familyId) {
      await this.storage.addToSet(familyTherapistAuditKey(event.familyId), event.id);
    }
    return event;
  }

  async saveExportSummary(summary: TherapistExportSummary): Promise<TherapistExportSummary> {
    await this.storage.setJson(exportSummaryKey(summary.id), summary);
    await this.storage.addToSet(sessionExportSummariesKey(summary.sessionId), summary.id);
    return summary;
  }

  async saveRiskAssessment(assessment: RiskAssessment): Promise<RiskAssessment> {
    await this.storage.setJson(riskAssessmentKey(assessment.sessionId), assessment);
    return assessment;
  }

  async getRiskAssessment(sessionId: string): Promise<RiskAssessment | null> {
    return this.storage.getJson<RiskAssessment>(riskAssessmentKey(sessionId));
  }

  async deleteSessionData(sessionId: string, familyId: string): Promise<{ sessionId: string; deletedKeys: string[] }> {
    const keys = [
      sessionKey(sessionId),
      turnsKey(sessionId),
      nodesKey(sessionId),
      recommendationsKey(sessionId),
      parentAnalysisKey(sessionId),
      parentPracticePlanKey(sessionId),
      childAnalysisKey(sessionId),
      childReflectionKey(sessionId),
      riskAssessmentKey(sessionId),
    ];
    await Promise.all(keys.map((key) => this.storage.deleteKey(key)));
    await this.storage.removeFromSet(familySessionsKey(familyId), sessionId);
    return { sessionId, deletedKeys: keys };
  }

  async savePrivacyAuditEvent(event: PrivacyAuditEvent): Promise<PrivacyAuditEvent> {
    await this.storage.setJson(privacyAuditEventKey(event.id), event);
    await this.storage.addToSet(familyPrivacyAuditKey(event.familyId), event.id);
    if (event.sessionId) {
      await this.storage.addToSet(sessionPrivacyAuditKey(event.sessionId), event.id);
    }
    return event;
  }

  async listPrivacyAuditEvents(familyId: string): Promise<PrivacyAuditEvent[]> {
    const eventIds = await this.storage.members(familyPrivacyAuditKey(familyId));
    const events = await Promise.all(eventIds.map((eventId) => this.storage.getJson<PrivacyAuditEvent>(privacyAuditEventKey(eventId))));
    return events
      .filter((event): event is PrivacyAuditEvent => Boolean(event))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async savePrivacyExportBundle(bundle: PrivacyExportBundle): Promise<PrivacyExportBundle> {
    await this.storage.setJson(privacyExportKey(bundle.id), bundle);
    await this.storage.addToSet(familyPrivacyExportsKey(bundle.familyId), bundle.id);
    return bundle;
  }

  private async markSessionUpdated(
    sessionId: string,
    transcriptStatus: ConversationSession["transcriptStatus"],
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    await this.storage.setJson(sessionKey(sessionId), {
      ...session,
      transcriptStatus,
      updatedAt: now(),
    });
  }

  private async markSessionAudioUploaded(sessionId: string, audioStoragePath: string | null): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    await this.storage.setJson(sessionKey(sessionId), {
      ...session,
      audioStoragePath,
      inputMode: "uploaded_audio_transient",
      transcriptStatus: "uploaded",
      updatedAt: now(),
    });
  }
}

const sessionKey = (sessionId: string) => `session:${sessionId}`;
const familySessionsKey = (familyId: string) => `family:${familyId}:sessions`;
const turnsKey = (sessionId: string) => `session:${sessionId}:turns`;
const nodesKey = (sessionId: string) => `session:${sessionId}:nodes`;
const recommendationsKey = (sessionId: string) => `session:${sessionId}:recommendations`;
const consentKey = (consentId: string) => `consent:${consentId}`;
const familyConsentKey = (familyId: string) => `family:${familyId}:consents`;
const therapistNoteKey = (noteId: string) => `therapistNote:${noteId}`;
const sessionTherapistNotesKey = (sessionId: string) => `session:${sessionId}:therapistNotes`;
const sessionMetricKey = (metricId: string) => `sessionMetric:${metricId}`;
const sessionMetricsKey = (sessionId: string) => `session:${sessionId}:metrics`;
const childHistoryKey = (familyId: string, childId: string) => `family:${familyId}:child:${childId}:history`;
const familyTrendSnapshotKey = (snapshotId: string) => `familyTrendSnapshot:${snapshotId}`;
const latestTrendSnapshotKey = (familyId: string, childId: string, periodType: string) =>
  `family:${familyId}:child:${childId}:trend:${periodType}:latest`;
const languagePreferenceKey = (preferenceId: string) => `languagePreference:${preferenceId}`;
const userLanguagePreferenceKey = (familyId: string, userId: string) =>
  `family:${familyId}:user:${userId}:languagePreference`;
const transcriptUploadKey = (uploadId: string) => `transcriptUpload:${uploadId}`;
const sessionTranscriptUploadsKey = (sessionId: string) => `session:${sessionId}:transcriptUploads`;
const audioUploadKey = (uploadId: string) => `audioUpload:${uploadId}`;
const sessionAudioUploadsKey = (sessionId: string) => `session:${sessionId}:audioUploads`;
const audioProcessingEventKey = (eventId: string) => `audioProcessingEvent:${eventId}`;
const sessionAudioProcessingEventsKey = (sessionId: string) => `session:${sessionId}:audioProcessingEvents`;
const rolePermissionKey = (permissionId: string) => `rolePermission:${permissionId}`;
const rolePermissionsKey = (role: string) => `role:${role}:permissions`;
const promptVersionKey = (promptId: string) => `promptVersion:${promptId}`;
const promptVersionsKey = (language: string) => `language:${language}:promptVersions`;
const safetyRuleKey = (ruleId: string) => `safetyRule:${ruleId}`;
const safetyRulesKey = (language: string, category: string) => `language:${language}:safetyRules:${category}`;
const auditLogKey = (eventId: string) => `auditLog:${eventId}`;
const auditLogsByActorKey = (actorUserId: string) => `user:${actorUserId}:auditLogs`;
const costUsageEventKey = (eventId: string) => `costUsageEvent:${eventId}`;
const costUsageEventsByFamilyKey = (familyId: string) => `family:${familyId}:costUsageEvents`;
const therapistAssignmentKey = (assignmentId: string) => `therapistAssignment:${assignmentId}`;
const therapistAssignmentsByFamilyKey = (familyId: string) => `family:${familyId}:therapistAssignments`;
const therapistAssignmentsByUserKey = (therapistUserId: string) => `user:${therapistUserId}:therapistAssignments`;
const parentAnalysisKey = (sessionId: string) => `session:${sessionId}:parentAnalysis`;
const parentPracticePlanKey = (sessionId: string) => `session:${sessionId}:parentPracticePlan`;
const childAnalysisKey = (sessionId: string) => `session:${sessionId}:childAnalysis`;
const childReflectionKey = (sessionId: string) => `session:${sessionId}:childReflection`;
const professionalNoteKey = (noteId: string) => `professionalNote:${noteId}`;
const sessionProfessionalNotesKey = (sessionId: string) => `session:${sessionId}:professionalNotes`;
const assignedPracticeKey = (practiceId: string) => `assignedPractice:${practiceId}`;
const sessionAssignedPracticeKey = (sessionId: string) => `session:${sessionId}:assignedPractice`;
const therapistAuditEventKey = (eventId: string) => `therapistAudit:${eventId}`;
const sessionTherapistAuditKey = (sessionId: string) => `session:${sessionId}:therapistAudit`;
const familyTherapistAuditKey = (familyId: string) => `family:${familyId}:therapistAudit`;
const exportSummaryKey = (summaryId: string) => `therapistExportSummary:${summaryId}`;
const sessionExportSummariesKey = (sessionId: string) => `session:${sessionId}:exportSummaries`;
const riskAssessmentKey = (sessionId: string) => `session:${sessionId}:riskAssessment`;
const privacyAuditEventKey = (eventId: string) => `privacyAudit:${eventId}`;
const familyPrivacyAuditKey = (familyId: string) => `family:${familyId}:privacyAudit`;
const sessionPrivacyAuditKey = (sessionId: string) => `session:${sessionId}:privacyAudit`;
const privacyExportKey = (exportId: string) => `privacyExport:${exportId}`;
const familyPrivacyExportsKey = (familyId: string) => `family:${familyId}:privacyExports`;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function topTags(tags: string[], limit = 5): string[] {
  const counts = tags.reduce<Record<string, number>>((result, tag) => {
    result[tag] = (result[tag] ?? 0) + 1;
    return result;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

function growthSummary(metrics: SessionMetric[]): Pick<FamilyTrendSnapshot, "mostImprovedSkill" | "recommendedFocus"> {
  if (metrics.length < 2) {
    return {
      mostImprovedSkill: "More sessions needed",
      recommendedFocus: "Add more consented sessions to compare communication improvement over time.",
    };
  }

  const midpoint = Math.ceil(metrics.length / 2);
  const earlier = metrics.slice(0, midpoint);
  const later = metrics.slice(midpoint);
  const deltas = [
    {
      skill: "validation improved",
      delta: average(later.map((metric) => metric.parentValidationScore)) - average(earlier.map((metric) => metric.parentValidationScore)),
    },
    {
      skill: "repair attempts increased",
      delta: average(later.map((metric) => metric.repairScore)) - average(earlier.map((metric) => metric.repairScore)),
    },
    {
      skill: "child clarity improved",
      delta: average(later.map((metric) => metric.childClarityScore)) - average(earlier.map((metric) => metric.childClarityScore)),
    },
    {
      skill: "escalation rate decreased",
      delta: average(earlier.map((metric) => metric.parentEscalationScore)) - average(later.map((metric) => metric.parentEscalationScore)),
    },
  ].sort((a, b) => b.delta - a.delta);
  const best = deltas[0];
  const needsFocus = deltas[deltas.length - 1];

  return {
    mostImprovedSkill: best.delta > 0 ? best.skill : "Communication baseline captured",
    recommendedFocus:
      needsFocus.delta < 0
        ? `Focus next on ${needsFocus.skill.replace(" improved", "").replace(" increased", "").replace(" decreased", "")} using coaching practice, not blame labels.`
        : "Continue reinforcing the patterns where communication improvement is visible.",
  };
}
