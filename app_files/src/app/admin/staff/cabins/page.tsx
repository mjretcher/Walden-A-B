import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";

/**
 * Superseded. Real cabin/bunk staff assignment now lives entirely on
 * /bunk-management/board (CabinStaffAssignment, session-scoped); the
 * non-cabin "custom housing" half of what this page used to do (Nurse
 * Cabin, Staff House, etc.) moved to /bunk-management/staff-housing.
 * Kept as a redirect rather than deleted outright so any existing
 * bookmarks/links (e.g. the one on /admin/staff) still land somewhere
 * correct instead of 404ing.
 */
export default async function StaffCabinAssignmentsRedirectPage() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  redirect("/bunk-management/staff-housing");
}
