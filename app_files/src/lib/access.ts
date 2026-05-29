import { UserRole } from "@prisma/client";

export const roleRank: Record<UserRole, number> = {
  [UserRole.COUNSELOR]: 1,
  [UserRole.AREA_HEAD]: 2,
  [UserRole.EXECUTIVE_ADMIN]: 3
};

export function hasRole(userRole: UserRole, allowed: UserRole[]) {
  return allowed.includes(userRole);
}

export function canOverrideCapacity(role: UserRole) {
  return role === UserRole.EXECUTIVE_ADMIN || role === UserRole.AREA_HEAD;
}

export function canManageUsers(role: UserRole) {
  return role === UserRole.EXECUTIVE_ADMIN;
}

export function roleLabel(role: UserRole) {
  return role
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}
