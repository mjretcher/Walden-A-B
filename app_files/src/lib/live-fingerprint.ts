import { prisma } from "@/lib/prisma";

/**
 * Cheap change-detection fingerprints for pages that multiple people work
 * on at the same time (bunk board, PreScream, outages, switches).
 *
 * The trick: a fingerprint is `count:maxTimestamp` per table, joined
 * together. Using count AND max timestamp makes deletions visible without
 * any schema changes — deleting a row never touches any surviving row's
 * updatedAt (the exact gap the Scream Session board had to solve with an
 * explicit Session.lastStaffingChangeAt column), but it DOES change the
 * count. Insert bumps count, update bumps max(updatedAt), delete drops
 * count. No new columns, no extra writes on the hot path.
 *
 * The same function backs both the server page (baseline fingerprint
 * rendered into the initial HTML) and the polling API route, so the two
 * sides can never disagree about how a fingerprint is computed.
 *
 * Deliberately NOT used for the Scream Session board, which already has
 * its own tuned endpoint (/api/scream-session/last-updated) and banner.
 */

export type LiveScope = "bunk-board" | "prescream" | "outages" | "switches";

export const LIVE_SCOPES: LiveScope[] = ["bunk-board", "prescream", "outages", "switches"];

function part(count: number, latest: Date | null | undefined) {
  return `${count}:${latest ? latest.getTime() : 0}`;
}

export async function computeLiveFingerprint(scope: LiveScope, sessionId: string): Promise<string> {
  switch (scope) {
    case "bunk-board": {
      // Staff-side assignments plus camper/CA cabin membership. Campers are
      // filtered to cabin-assigned ones so unrelated camper admin edits
      // don't trip the banner; a cabin move touches the camper's updatedAt,
      // and assign/unassign changes the count. Cabin table covers bed-count
      // and cabin roster edits.
      const [staffAssignments, staffAssignmentLatest, assignedCampers, assignedCamperLatest, cabins, cabinLatest] = await Promise.all([
        prisma.cabinStaffAssignment.count({ where: { sessionId } }),
        prisma.cabinStaffAssignment.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.camper.count({ where: { sessionId, active: true, cabinId: { not: null } } }),
        prisma.camper.findFirst({ where: { sessionId, active: true, cabinId: { not: null } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.cabin.count(),
        prisma.cabin.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
      ]);
      return [part(staffAssignments, staffAssignmentLatest?.updatedAt), part(assignedCampers, assignedCamperLatest?.updatedAt), part(cabins, cabinLatest?.updatedAt)].join("|");
    }
    case "prescream": {
      // Conflicts + claims + the real staff assignments claims resolve into.
      // Claims have no updatedAt (create/delete only), so count + max
      // createdAt fully covers them.
      const [conflicts, conflictLatest, claims, claimLatest, assignments, assignmentLatest] = await Promise.all([
        prisma.preScreamConflict.count({ where: { sessionId } }),
        prisma.preScreamConflict.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.preScreamClaim.count({ where: { conflict: { sessionId } } }),
        prisma.preScreamClaim.findFirst({ where: { conflict: { sessionId } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.staffAssignment.count({ where: { sessionId } }),
        prisma.staffAssignment.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
      ]);
      return [part(conflicts, conflictLatest?.updatedAt), part(claims, claimLatest?.createdAt), part(assignments, assignmentLatest?.updatedAt)].join("|");
    }
    case "outages": {
      // Outage rows carry updatedAt; the camper/staff join rows are
      // create/delete only, so their counts catch people being added or
      // removed from a trip.
      const [outages, outageLatest, outageCampers, outageStaff] = await Promise.all([
        prisma.outage.count({ where: { sessionId } }),
        prisma.outage.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.outageCamper.count({ where: { outage: { sessionId } } }),
        prisma.outageStaff.count({ where: { outage: { sessionId } } })
      ]);
      return [part(outages, outageLatest?.updatedAt), `${outageCampers}`, `${outageStaff}`].join("|");
    }
    case "switches": {
      const [requests, requestLatest] = await Promise.all([
        prisma.switchRequest.count({ where: { sessionId } }),
        prisma.switchRequest.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
      ]);
      return part(requests, requestLatest?.updatedAt);
    }
  }
}
