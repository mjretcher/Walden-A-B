import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEventGuest, normalizeJoinCode } from "@/lib/event-auth";
import { CampWaldenLogo } from "@/components/brand";
import { JoinForm } from "./join-form";

/**
 * Public landing for Registration Day: the QR on the mess-hall screen points
 * here with ?code= prefilled. No login required — a valid code + a typed
 * name is the whole handshake. Someone who already joined gets bounced
 * straight to the registration screen.
 */
export default async function JoinPage({ searchParams }: { searchParams?: Promise<{ code?: string | string[] }> }) {
  const existing = await getCurrentEventGuest();
  if (existing) redirect("/event-registration");

  const params = searchParams ? await searchParams : {};
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const prefillCode = rawCode ? normalizeJoinCode(rawCode) : "";

  const activeEvent = await prisma.registrationEvent.findFirst({
    where: { active: true },
    select: { name: true }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-forest-900 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-forest-700 bg-white p-6 shadow-panel">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <CampWaldenLogo className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-forest-900">Registration Day</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {activeEvent ? `Join "${activeEvent.name}" to start registering campers.` : "No event is open right now — check with the front of the room."}
            </p>
          </div>
        </div>
        <JoinForm prefillCode={prefillCode} eventOpen={Boolean(activeEvent)} />
      </div>
    </main>
  );
}
