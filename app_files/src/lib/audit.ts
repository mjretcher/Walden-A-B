import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Append-only audit logger for sensitive security events.
 *
 * Design notes:
 *   - Wrapped in try/catch and intentionally swallows errors. An audit
 *     write failing should NEVER block the user-facing action it's
 *     logging (you don't want a flaky DB write to lock people out of
 *     login). Failures are console.error'd for visibility.
 *   - All writes are fire-and-forget (`void` return). Callers do not
 *     await this; that way a slow audit write can't slow logins.
 *   - Keep the payload small. The metadata field accepts arbitrary
 *     JSON but pass only short, structured detail — not full request
 *     bodies or PII beyond what's needed to investigate an incident.
 *
 * Action naming convention: dot-separated, lowercase, past tense:
 *   "login.success", "login.fail", "logout", "user.create",
 *   "user.role_change", "user.toggle_active"
 */

type AuditInput = {
  action: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export function logAudit(input: AuditInput): void {
  // Fire-and-forget. Any error is logged but not propagated.
  prisma.auditLog
    .create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? Prisma.DbNull
      }
    })
    .catch((err: unknown) => {
      console.error("[audit] write failed:", err);
    });
}

/** Convenience: pull ip + ua out of a Next.js Request-shaped object. */
export function requestContext(request: { headers: { get(name: string): string | null } }): {
  ip: string | null;
  userAgent: string | null;
} {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff ? (xff.split(",")[0]?.trim() ?? null) : request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}
