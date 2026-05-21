import { randomUUID } from "node:crypto";
import type { Sprint1StorageAdapter } from "./storageAdapter";

export type AdminUserRecord = {
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

export type AdminFamilyRecord = {
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

export type AdminTherapistRecord = {
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

export type AdminBreakGlassEvent = {
  id: string;
  actorUserId: string;
  actorRole: string;
  reason: string;
  resourceType: "user" | "family" | "session" | "audit_log";
  resourceId: string;
  timestamp: string;
  ipHash: string;
};

const userKeyPrefix = "admin:user:";
const familyKeyPrefix = "admin:family:";
const therapistKeyPrefix = "admin:therapist:";
const breakGlassSetKey = "admin:break-glass:events";
const breakGlassKeyPrefix = "admin:break-glass:event:";
const userIndexKey = "admin:users:index";
const familyIndexKey = "admin:families:index";
const therapistIndexKey = "admin:therapists:index";

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

export class AdminRepository {
  constructor(private readonly storage: Sprint1StorageAdapter) {}

  async listUsers(): Promise<AdminUserRecord[]> {
    const ids = await this.storage.members(userIndexKey);
    const results = await Promise.all(ids.map((id) => this.storage.getJson<AdminUserRecord>(`${userKeyPrefix}${id}`)));
    return results.filter((r): r is AdminUserRecord => r !== null);
  }

  async getUser(id: string): Promise<AdminUserRecord | null> {
    return this.storage.getJson<AdminUserRecord>(`${userKeyPrefix}${id}`);
  }

  async saveUser(user: Omit<AdminUserRecord, "id" | "createdAt">): Promise<AdminUserRecord> {
    const record: AdminUserRecord = { ...user, id: newId("user"), createdAt: now() };
    await this.storage.setJson(`${userKeyPrefix}${record.id}`, record);
    await this.storage.addToSet(userIndexKey, record.id);
    return record;
  }

  async updateUserRole(userId: string, role: string): Promise<AdminUserRecord | null> {
    const user = await this.getUser(userId);
    if (!user) return null;
    const updated: AdminUserRecord = { ...user, role };
    await this.storage.setJson(`${userKeyPrefix}${userId}`, updated);
    return updated;
  }

  async suspendUser(userId: string): Promise<AdminUserRecord | null> {
    const user = await this.getUser(userId);
    if (!user) return null;
    const updated: AdminUserRecord = { ...user, status: "suspended" };
    await this.storage.setJson(`${userKeyPrefix}${userId}`, updated);
    return updated;
  }

  async listFamilies(): Promise<AdminFamilyRecord[]> {
    const ids = await this.storage.members(familyIndexKey);
    const results = await Promise.all(ids.map((id) => this.storage.getJson<AdminFamilyRecord>(`${familyKeyPrefix}${id}`)));
    return results.filter((r): r is AdminFamilyRecord => r !== null);
  }

  async getFamily(id: string): Promise<AdminFamilyRecord | null> {
    return this.storage.getJson<AdminFamilyRecord>(`${familyKeyPrefix}${id}`);
  }

  async saveFamily(family: Omit<AdminFamilyRecord, "id" | "createdAt">): Promise<AdminFamilyRecord> {
    const record: AdminFamilyRecord = { ...family, id: newId("family"), createdAt: now() };
    await this.storage.setJson(`${familyKeyPrefix}${record.id}`, record);
    await this.storage.addToSet(familyIndexKey, record.id);
    return record;
  }

  async listTherapists(): Promise<AdminTherapistRecord[]> {
    const ids = await this.storage.members(therapistIndexKey);
    const results = await Promise.all(ids.map((id) => this.storage.getJson<AdminTherapistRecord>(`${therapistKeyPrefix}${id}`)));
    return results.filter((r): r is AdminTherapistRecord => r !== null);
  }

  async getTherapist(id: string): Promise<AdminTherapistRecord | null> {
    return this.storage.getJson<AdminTherapistRecord>(`${therapistKeyPrefix}${id}`);
  }

  async saveTherapist(therapist: Omit<AdminTherapistRecord, "id" | "createdAt">): Promise<AdminTherapistRecord> {
    const record: AdminTherapistRecord = { ...therapist, id: newId("therapist"), createdAt: now() };
    await this.storage.setJson(`${therapistKeyPrefix}${record.id}`, record);
    await this.storage.addToSet(therapistIndexKey, record.id);
    return record;
  }

  async recordBreakGlassEvent(
    actorUserId: string,
    actorRole: string,
    reason: string,
    resourceType: AdminBreakGlassEvent["resourceType"],
    resourceId: string,
    ipHash: string,
  ): Promise<AdminBreakGlassEvent> {
    const event: AdminBreakGlassEvent = {
      id: newId("bg"),
      actorUserId,
      actorRole,
      reason,
      resourceType,
      resourceId,
      timestamp: now(),
      ipHash,
    };
    await this.storage.setJson(`${breakGlassKeyPrefix}${event.id}`, event);
    await this.storage.addToSet(breakGlassSetKey, event.id);
    return event;
  }

  async listBreakGlassEvents(): Promise<AdminBreakGlassEvent[]> {
    const ids = await this.storage.members(breakGlassSetKey);
    const results = await Promise.all(ids.map((id) => this.storage.getJson<AdminBreakGlassEvent>(`${breakGlassKeyPrefix}${id}`)));
    return results
      .filter((r): r is AdminBreakGlassEvent => r !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}
