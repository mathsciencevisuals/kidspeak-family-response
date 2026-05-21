export type UserRole =
  | "super_admin"
  | "clinical_admin"
  | "therapist"
  | "psychologist"
  | "parent"
  | "child"
  | "school_counselor"
  | "support_staff"
  | "auditor"
  | "admin";

export type RoutePermission = {
  path: string | RegExp;
  allowedRoles: UserRole[];
  sensitive?: boolean;
};

const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];
const CLINICAL_ROLES: UserRole[] = ["super_admin", "admin", "clinical_admin"];
const THERAPIST_ROLES: UserRole[] = ["super_admin", "admin", "clinical_admin", "therapist", "psychologist"];
const AUDIT_ROLES: UserRole[] = ["super_admin", "admin", "auditor"];
const PARENT_ROLES: UserRole[] = ["super_admin", "parent"];
const ALL_ROLES: UserRole[] = ["super_admin", "admin", "clinical_admin", "therapist", "psychologist", "parent", "child", "school_counselor", "support_staff", "auditor"];

export const ROUTE_PERMISSIONS: RoutePermission[] = [
  { path: "/dashboard", allowedRoles: ALL_ROLES },
  { path: "/record", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/upload-audio", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/upload-transcript", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/sessions", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/history", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/history/trends", allowedRoles: PARENT_ROLES, sensitive: true },
  { path: /^\/sessions\/[^/]+(?:\/.*)?$/, allowedRoles: PARENT_ROLES, sensitive: true },
  { path: "/therapist", allowedRoles: THERAPIST_ROLES, sensitive: true },
  { path: /^\/therapist\/admin(?:\/.*)?$/, allowedRoles: THERAPIST_ROLES, sensitive: true },
  { path: /^\/therapist\/(?:families|sessions)\/[^/]+$/, allowedRoles: THERAPIST_ROLES, sensitive: true },
  { path: "/admin", allowedRoles: CLINICAL_ROLES },
  { path: "/admin/users", allowedRoles: ADMIN_ROLES },
  { path: "/admin/roles", allowedRoles: CLINICAL_ROLES },
  { path: "/admin/families", allowedRoles: ADMIN_ROLES },
  { path: "/admin/therapists", allowedRoles: ADMIN_ROLES },
  { path: "/admin/languages", allowedRoles: CLINICAL_ROLES },
  { path: "/admin/prompts", allowedRoles: [...CLINICAL_ROLES, "auditor"] },
  { path: "/admin/safety-rules", allowedRoles: CLINICAL_ROLES },
  { path: "/admin/privacy", allowedRoles: [...CLINICAL_ROLES, "auditor"] },
  { path: "/admin/compliance", allowedRoles: [...CLINICAL_ROLES, "auditor"] },
  { path: "/admin/infrastructure", allowedRoles: [...ADMIN_ROLES, "support_staff"] },
  { path: "/admin/cost", allowedRoles: CLINICAL_ROLES },
  { path: "/admin/audit-logs", allowedRoles: AUDIT_ROLES },
  { path: "/admin/feature-flags", allowedRoles: [...ADMIN_ROLES, "support_staff"] },
  { path: /^\/settings\/(?:consent|privacy|language|therapist-sharing|export-data|delete-data)$/, allowedRoles: PARENT_ROLES, sensitive: true },
];

const TRANSCRIPT_BLOCKED_ROLES: UserRole[] = ["support_staff", "child"];
const PLATFORM_ADMIN_ROLES: UserRole[] = CLINICAL_ROLES;
const BREAK_GLASS_ROLES: UserRole[] = ["super_admin", "admin"];

export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

export function canAccessPath(userRole: UserRole, path: string): { allowed: boolean; reason: string } {
  if (userRole === "support_staff" && isSensitivePath(path)) {
    return { allowed: false, reason: "Support staff cannot view transcripts or child-sensitive pages." };
  }

  for (const permission of ROUTE_PERMISSIONS) {
    const matches = typeof permission.path === "string"
      ? permission.path === path
      : permission.path.test(path);
    if (matches) {
      return permission.allowedRoles.includes(userRole)
        ? { allowed: true, reason: "Role matches route permission." }
        : { allowed: false, reason: `${userRole} is not allowed on this route.` };
    }
  }

  return userRole === "super_admin" || userRole === "admin"
    ? { allowed: true, reason: "Admin fallback access." }
    : { allowed: false, reason: "No permission rule matched for this role." };
}

export function canViewTranscripts(userRole: UserRole): boolean {
  return !TRANSCRIPT_BLOCKED_ROLES.includes(userRole);
}

export function canManagePlatform(userRole: UserRole): boolean {
  return PLATFORM_ADMIN_ROLES.includes(userRole);
}

export function canManageUsers(userRole: UserRole): boolean {
  return ADMIN_ROLES.includes(userRole);
}

export function canManageRoles(userRole: UserRole): boolean {
  return ADMIN_ROLES.includes(userRole);
}

export function canViewAuditLogs(userRole: UserRole): boolean {
  return AUDIT_ROLES.includes(userRole);
}

export function canAccessClinicalData(userRole: UserRole): boolean {
  return CLINICAL_ROLES.includes(userRole);
}

export function canUseBreakGlass(userRole: UserRole): boolean {
  return BREAK_GLASS_ROLES.includes(userRole);
}

export function requiresBreakGlass(path: string): boolean {
  return /^\/admin\/(?:users|families|audit-logs)$/.test(path);
}

export function isSensitivePath(path: string): boolean {
  return (
    /^\/sessions(?:\/.*)?$/.test(path) ||
    /^\/record$/.test(path) ||
    /^\/upload-(?:audio|transcript)$/.test(path) ||
    /^\/history(?:\/.*)?$/.test(path) ||
    /^\/therapist(?:\/.*)?$/.test(path) ||
    /^\/settings\/(?:consent|privacy|therapist-sharing|export-data|delete-data)$/.test(path)
  );
}

export function scopeDescription(userRole: UserRole): string {
  switch (userRole) {
    case "super_admin":
    case "admin":
      return "Full platform access. Break-glass requires audit reason.";
    case "clinical_admin":
      return "Risk queue, clinical configuration, and language/prompt management.";
    case "therapist":
    case "psychologist":
      return "Assigned consented families only.";
    case "school_counselor":
      return "School-assigned students only, no raw data.";
    case "parent":
      return "Own family only.";
    case "child":
      return "Child-friendly pages only.";
    case "support_staff":
      return "Non-sensitive operational pages. No transcripts or coaching data.";
    case "auditor":
      return "Audit logs and compliance views only. Read-only.";
  }
}
