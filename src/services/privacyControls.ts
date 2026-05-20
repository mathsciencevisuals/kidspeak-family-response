import { z } from "zod";

export const retentionActionSchema = z.enum([
  "delete_audio_after_analysis",
  "keep_audio_7_days",
  "keep_audio_30_days",
  "keep_transcript",
  "delete_transcript_keep_summary",
  "delete_entire_session",
]);

export const dataExportTypeSchema = z.enum([
  "session_summaries",
  "transcript",
  "recommendations",
  "parent_visible_therapist_notes",
]);

export const privacyAuditEventTypeSchema = z.enum([
  "consent_granted",
  "consent_revoked",
  "audio_uploaded",
  "analysis_run",
  "therapist_viewed",
  "data_exported",
  "data_deleted",
]);

export const privacyConsentPayloadSchema = z.object({
  familyId: z.string().min(1),
  childId: z.string().min(1),
  parentUserId: z.string().min(1),
  consentType: z.enum(["recording", "therapist_share", "data_retention", "research_opt_in"]),
});

export const deleteSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
  familyId: z.string().min(1),
  deleteMode: z.enum(["one_session", "child_profile", "all_family_data"]).default("one_session"),
});

export const exportDataPayloadSchema = z.object({
  familyId: z.string().min(1),
  sessionId: z.string().optional(),
  exportTypes: z.array(dataExportTypeSchema).min(1),
});

export type PrivacyAuditEventType = z.infer<typeof privacyAuditEventTypeSchema>;
export type PrivacyConsentPayload = z.infer<typeof privacyConsentPayloadSchema>;
export type DeleteSessionPayload = z.infer<typeof deleteSessionPayloadSchema>;
export type ExportDataPayload = z.infer<typeof exportDataPayloadSchema>;

export interface PrivacyAuditEvent {
  id: string;
  familyId: string;
  sessionId?: string;
  eventType: PrivacyAuditEventType;
  actorUserId: string;
  createdAt: string;
  details: string;
}

export interface PrivacyExportBundle {
  id: string;
  familyId: string;
  sessionId?: string;
  createdAt: string;
  exportTypes: Array<z.infer<typeof dataExportTypeSchema>>;
  files: Array<{
    label: string;
    contentType: "application/json";
    compressed: boolean;
    notes: string;
  }>;
  safetyLimits: string[];
}

export const childFriendlyNotice =
  "We record only to help understand conversations and practise better responses.";

export const audioRetentionOptions = [
  "Delete raw audio immediately after analysis",
  "Keep for 7 days",
  "Keep for 30 days",
];

export const transcriptRetentionOptions = [
  "Keep transcript",
  "Delete transcript but keep summary",
  "Delete entire session",
];

export const privacySafetyPrinciples = [
  "No hidden recording.",
  "No ads based on child behaviour.",
  "No selling or sharing child behavioural data.",
];

export function createPrivacyAuditEvent(input: {
  familyId: string;
  sessionId?: string;
  eventType: PrivacyAuditEventType;
  actorUserId?: string;
  details: string;
}): PrivacyAuditEvent {
  return {
    id: `privacy_audit_${crypto.randomUUID()}`,
    familyId: input.familyId,
    sessionId: input.sessionId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? "user_parent_1",
    createdAt: new Date().toISOString(),
    details: input.details,
  };
}

export function createPrivacyExportBundle(input: ExportDataPayload): PrivacyExportBundle {
  return {
    id: `privacy_export_${crypto.randomUUID()}`,
    familyId: input.familyId,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    exportTypes: input.exportTypes,
    files: input.exportTypes.map((type) => ({
      label: type.replaceAll("_", " "),
      contentType: "application/json",
      compressed: true,
      notes: exportNotes(type),
    })),
    safetyLimits: [
      "Therapist notes are included only when visible to parent.",
      "No hidden child profile data is exported.",
      "Summaries are compressed JSON for MVP cost control.",
    ],
  };
}

function exportNotes(type: ExportDataPayload["exportTypes"][number]): string {
  if (type === "parent_visible_therapist_notes") {
    return "Includes only therapist notes marked shared_with_parent.";
  }
  if (type === "transcript") {
    return "Exports the session transcript once; duplicate transcripts are not retained.";
  }
  if (type === "recommendations") {
    return "Exports coaching recommendations without diagnostic labels.";
  }
  return "Exports compact session summaries.";
}
