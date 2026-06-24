import { SwitchStatus } from "@prisma/client";
import { Panel, SectionHeader } from "@/components/ui";

export type OutboundRequestItem = {
  id: string;
  personName: string;
  periodLabel: string;
  areaName: string;
  activityName: string;
  submittedLabel: string;
  status: SwitchStatus;
};

function statusLine(item: OutboundRequestItem): { text: string; className: string } {
  if (item.status === SwitchStatus.PENDING) {
    return { text: `Submitted ${item.submittedLabel} · Awaiting ${item.areaName} area head review`, className: "text-amber-700" };
  }
  if (item.status === SwitchStatus.DENIED) {
    return { text: `Submitted ${item.submittedLabel} · DENIED`, className: "text-red-700" };
  }
  return { text: `Submitted ${item.submittedLabel} · APPROVED ✓`, className: "text-forest-700" };
}

/**
 * Cross-area pending requests the user has visibility into: an area head's own
 * submissions routed to other areas, or — for exec admins — every cross-area
 * request in flight. Lives below the pending queue on the hub (spec §4).
 */
export function OutboundRequests({ items, isExec }: { items: OutboundRequestItem[]; isExec: boolean }) {
  return (
    <Panel className="mt-6">
      <SectionHeader
        title={isExec ? `Cross-area requests (${items.length})` : `My outbound requests (${items.length})`}
        description={
          isExec
            ? "Switch requests whose destination area differs from where the person is currently placed."
            : "Switches you submitted that are routed to another area for approval."
        }
      />
      <div className="grid gap-2">
        {items.map((item) => {
          const status = statusLine(item);
          return (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-bold text-forest-900">
                {item.personName} <span className="font-semibold text-slate-500">· {item.periodLabel} ·</span> {item.areaName} — {item.activityName}
              </p>
              <p className={`mt-0.5 text-sm font-semibold ${status.className}`}>{status.text}</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
