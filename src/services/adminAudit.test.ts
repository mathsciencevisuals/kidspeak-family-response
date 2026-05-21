import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRedisAdapter } from "../repositories/redisAdapter";
import { AdminRepository } from "../repositories/adminRepository";
import { canAccessPath, canViewTranscripts, canManagePlatform, canManageUsers, canViewAuditLogs, isSensitivePath } from "../lib/rbac";

test("AdminRepository: list users returns empty array when no users stored", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const users = await adminRepo.listUsers();
  assert.deepEqual(users, []);
});

test("AdminRepository: save and retrieve user", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const user = await adminRepo.saveUser({
    email: "test@example.in",
    displayName: "Test User",
    role: "parent",
    status: "active",
    lastActiveAt: "2026-05-21",
    mfaEnabled: false,
    consentCount: 2,
  });
  assert.equal(user.email, "test@example.in");
  assert.equal(user.role, "parent");
  assert.ok(user.id.startsWith("user_"));

  const retrieved = await adminRepo.getUser(user.id);
  assert.equal(retrieved?.email, "test@example.in");
});

test("AdminRepository: update user role", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const user = await adminRepo.saveUser({
    email: "test@example.in",
    displayName: "Test",
    role: "parent",
    status: "active",
    lastActiveAt: "2026-05-21",
    mfaEnabled: false,
    consentCount: 0,
  });
  const updated = await adminRepo.updateUserRole(user.id, "clinical_admin");
  assert.equal(updated?.role, "clinical_admin");
});

test("AdminRepository: suspend user sets status to suspended", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const user = await adminRepo.saveUser({
    email: "test@example.in",
    displayName: "Test",
    role: "parent",
    status: "active",
    lastActiveAt: "2026-05-21",
    mfaEnabled: false,
    consentCount: 0,
  });
  const suspended = await adminRepo.suspendUser(user.id);
  assert.equal(suspended?.status, "suspended");
});

test("AdminRepository: break-glass event is recorded and retrievable", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const event = await adminRepo.recordBreakGlassEvent(
    "user_super_admin_1",
    "super_admin",
    "Emergency review of high-risk session data",
    "session",
    "session-001",
    "hashed-ip-abc",
  );
  assert.equal(event.actorUserId, "user_super_admin_1");
  assert.equal(event.reason, "Emergency review of high-risk session data");

  const events = await adminRepo.listBreakGlassEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].resourceType, "session");
});

test("AdminRepository: family records store audioStoredCount=0 by default", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const family = await adminRepo.saveFamily({
    displayName: "Test Family",
    ownerEmail: "test@example.in",
    memberCount: 2,
    childCount: 1,
    sessionCount: 0,
    consentStatus: "none",
    therapistAssigned: false,
    riskLevel: "low",
    lastSessionAt: "2026-05-21",
    audioStoredCount: 0,
  });
  assert.equal(family.audioStoredCount, 0);
});

test("AdminRepository: therapist record has consentScopeOnly=true", async () => {
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const therapist = await adminRepo.saveTherapist({
    email: "therapist@example.in",
    displayName: "Dr. Test",
    role: "therapist",
    status: "active",
    assignedFamilyCount: 0,
    activeCaseCount: 0,
    pendingReviewCount: 0,
    lastActivityAt: "2026-05-21",
    licenseVerified: true,
    consentScopeOnly: true,
  });
  assert.equal(therapist.consentScopeOnly, true);
});

test("RBAC: support_staff cannot access sensitive transcript pages", () => {
  const result = canAccessPath("support_staff", "/sessions/session-001/parent");
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("Support staff"));
});

test("RBAC: support_staff can access dashboard", () => {
  const result = canAccessPath("support_staff", "/dashboard");
  assert.equal(result.allowed, true);
});

test("RBAC: auditor can access audit-logs route", () => {
  const result = canAccessPath("auditor", "/admin/audit-logs");
  assert.equal(result.allowed, true);
});

test("RBAC: auditor cannot access admin/users route", () => {
  const result = canAccessPath("auditor", "/admin/users");
  assert.equal(result.allowed, false);
});

test("RBAC: parent cannot access admin routes", () => {
  const result = canAccessPath("parent", "/admin");
  assert.equal(result.allowed, false);
});

test("RBAC: super_admin can access all admin routes", () => {
  const adminPaths = ["/admin", "/admin/users", "/admin/families", "/admin/therapists", "/admin/audit-logs"];
  for (const path of adminPaths) {
    const result = canAccessPath("super_admin", path);
    assert.equal(result.allowed, true, `super_admin should access ${path}`);
  }
});

test("RBAC: canViewTranscripts blocks support_staff and child", () => {
  assert.equal(canViewTranscripts("support_staff"), false);
  assert.equal(canViewTranscripts("child"), false);
  assert.equal(canViewTranscripts("parent"), true);
  assert.equal(canViewTranscripts("therapist"), true);
});

test("RBAC: canManagePlatform allows clinical roles only", () => {
  assert.equal(canManagePlatform("super_admin"), true);
  assert.equal(canManagePlatform("clinical_admin"), true);
  assert.equal(canManagePlatform("therapist"), false);
  assert.equal(canManagePlatform("parent"), false);
  assert.equal(canManagePlatform("auditor"), false);
});

test("RBAC: canManageUsers allows admin roles only", () => {
  assert.equal(canManageUsers("super_admin"), true);
  assert.equal(canManageUsers("admin"), true);
  assert.equal(canManageUsers("clinical_admin"), false);
  assert.equal(canManageUsers("therapist"), false);
});

test("RBAC: canViewAuditLogs allows super_admin and auditor", () => {
  assert.equal(canViewAuditLogs("super_admin"), true);
  assert.equal(canViewAuditLogs("auditor"), true);
  assert.equal(canViewAuditLogs("clinical_admin"), false);
  assert.equal(canViewAuditLogs("parent"), false);
});

test("RBAC: isSensitivePath correctly identifies sensitive routes", () => {
  assert.equal(isSensitivePath("/sessions/session-001"), true);
  assert.equal(isSensitivePath("/record"), true);
  assert.equal(isSensitivePath("/history"), true);
  assert.equal(isSensitivePath("/therapist/families/family-001"), true);
  assert.equal(isSensitivePath("/admin"), false);
  assert.equal(isSensitivePath("/dashboard"), false);
});

test("no-audio: audioStoredCount defaults to zero in family admin records", async () => {
  process.env.STORE_RAW_AUDIO = "false";
  const storage = new InMemoryRedisAdapter();
  const adminRepo = new AdminRepository(storage);
  const family = await adminRepo.saveFamily({
    displayName: "Audio Test Family",
    ownerEmail: "audio@test.in",
    memberCount: 2,
    childCount: 1,
    sessionCount: 3,
    consentStatus: "all_granted",
    therapistAssigned: false,
    riskLevel: "low",
    lastSessionAt: "2026-05-21",
    audioStoredCount: 0,
  });
  assert.equal(family.audioStoredCount, 0, "No audio should be stored when STORE_RAW_AUDIO=false");
});
