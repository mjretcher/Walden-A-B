"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, LogOut, Plus, ScanLine, Search, Trash2, X } from "lucide-react";

/**
 * Mess-hall registration flow: search camper → A/B card → tap a period →
 * pick an offering → confirm. Built for phones (25-30 people at once).
 *
 * Eligibility is enforced SERVER-side by the shared /api/registration
 * endpoint — this client only hints (seat pills, unit/swim chips) and then
 * reacts to the server's answer: a "waitlistAvailable" rejection offers the
 * waitlist, any other rejection offers the Area-Head-named override. That
 * keeps exactly one copy of the rules.
 *
 * Any 401 means the event was closed (or the session expired) — bounce to
 * /join rather than leaving someone tapping a dead screen.
 */

type CamperRow = {
  id: string;
  name: string;
  cabin: string;
  unit: string;
  gender: string;
  swim: string;
  counselorAssistant: boolean;
};

type OfferingRow = {
  id: string;
  period: string;
  activity: string;
  area: string;
  count: number;
  limit?: number | null;
  allowWaitlist: boolean;
  spansTwoPeriods: boolean;
  eligibleUnits: string[];
  eligibleSwimCodes: string[];
  eligibleSwimLabels: string[];
};

type ScheduleEntry = {
  id: string;
  period: string;
  activity: string;
  area: string;
  approval: string;
  isTeachingAssistant: boolean;
};

type Toast = { id: number; tone: "green" | "red" | "amber"; text: string };

const A_PERIODS = ["1A", "2A", "3A", "4A"] as const;
const B_PERIODS = ["1B", "2B", "3B", "4B"] as const;

function genderShort(gender: string) {
  return gender.startsWith("F") ? "G" : "B";
}

// Pull a camper id out of whatever a QR decoded to. Camper cards encode
// a full URL (/registration?camper={id}); a bare cuid is accepted too so
// any future raw-id QR keeps working.
function camperIdFromQrValue(value: string): string | null {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const fromParam = url.searchParams.get("camper");
    if (fromParam) return fromParam;
  } catch {
    // not a URL — fall through to raw-id check
  }
  return /^c[a-z0-9]{10,}$/i.test(trimmed) ? trimmed : null;
}

/**
 * Full-screen camera QR scanner. Decoding strategy: the native
 * BarcodeDetector API where the browser has it (Android Chrome), else
 * jsQR on downscaled canvas frames — that fallback is the one that
 * matters, because the mess hall is mostly iPhones and iOS Safari has no
 * BarcodeDetector. Frames are sampled ~5x/sec at <=480px wide to keep a
 * phone from cooking itself during a long scan session.
 */
function QrScanner({ onDetect, onClose }: { onDetect: (value: string) => boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DetectorCtor = (window as any).BarcodeDetector;
    const detector = DetectorCtor ? new DetectorCtor({ formats: ["qr_code"] }) : null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
      } catch {
        if (!cancelled) setError("Couldn't open the camera — check that camera access is allowed for this site, or just use search.");
        return;
      }
      if (cancelled || !videoRef.current) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => null);

      timer = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        let decoded: string | null = null;
        if (detector) {
          try {
            const codes = await detector.detect(video);
            decoded = codes?.[0]?.rawValue ?? null;
          } catch {
            decoded = null;
          }
        }
        if (!decoded && context) {
          const scale = Math.min(1, 480 / (video.videoWidth || 480));
          canvas.width = Math.max(1, Math.round((video.videoWidth || 480) * scale));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 640) * scale));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          decoded = jsQR(image.data, image.width, image.height)?.data ?? null;
        }
        if (decoded) {
          // onDetect returns true when the value was accepted (camper
          // found) — the parent closes us. False (unknown QR / camper not
          // in this session) keeps the camera running for another try.
          const accepted = onDetect(decoded);
          if (accepted && timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      }, 200);
    }

    start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-black text-white">Scan a camper card</span>
        <button aria-label="Close scanner" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 text-white" onClick={onClose} type="button"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* playsInline is load-bearing on iOS — without it Safari fullscreens the video */}
        <video className="h-full w-full object-cover" muted playsInline ref={videoRef} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error ? (
          <div className="absolute inset-x-4 bottom-6 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-black text-red-900">{error}</div>
        ) : (
          <p className="absolute inset-x-4 bottom-6 text-center text-sm font-black text-white/90">Point at the QR on the camper&apos;s card</p>
        )}
      </div>
    </div>
  );
}

export function EventRegistrationClient({
  guestName,
  eventName,
  windowLabel,
  initialCamperId = null,
  campers,
  offerings: initialOfferings
}: {
  guestName: string;
  eventName: string;
  windowLabel: string;
  initialCamperId?: string | null;
  campers: CamperRow[];
  offerings: OfferingRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCamper, setSelectedCamper] = useState<CamperRow | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [offerings, setOfferings] = useState<OfferingRow[]>(initialOfferings);
  const [pickerPeriod, setPickerPeriod] = useState<string | null>(null);
  const [pendingOffering, setPendingOffering] = useState<OfferingRow | null>(null);
  const [rejection, setRejection] = useState<{ error: string; waitlistAvailable: boolean } | null>(null);
  const [overrideName, setOverrideName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ScheduleEntry | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  function pushToast(tone: Toast["tone"], text: string) {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, tone, text }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }

  function handleUnauthorized() {
    pushToast("red", "The event has been closed.");
    router.push("/join");
    router.refresh();
  }

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    const terms = query.split(/\s+/);
    return campers
      .filter((camper) => {
        const haystack = `${camper.name} ${camper.cabin}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 30);
  }, [search, campers]);

  const refreshCounts = async () => {
    try {
      const response = await fetch("/api/event/offerings");
      if (response.status === 401) return handleUnauthorized();
      if (!response.ok) return;
      const data = await response.json();
      const countMap = new Map<string, number>((data.counts ?? []).map((row: { offeringId: string; count: number }) => [row.offeringId, row.count]));
      setOfferings((current) => current.map((offering) => ({ ...offering, count: countMap.get(offering.id) ?? 0 })));
    } catch {
      // counts refresh is best-effort
    }
  };

  const loadSchedule = async (camperId: string) => {
    setScheduleLoading(true);
    try {
      const response = await fetch(`/api/campers/${camperId}/schedule`);
      if (response.status === 401) return handleUnauthorized();
      const data = await response.json().catch(() => ({ registrations: [] }));
      setSchedule(data.registrations ?? []);
    } catch {
      pushToast("red", "Couldn't load the schedule — try again.");
    } finally {
      setScheduleLoading(false);
    }
  };

  // Counts drift fast with 30 people registering — refresh on a timer while
  // the tab is open, plus after every save/remove below.
  useEffect(() => {
    const interval = setInterval(refreshCounts, 20_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCamper(camper: CamperRow) {
    setSelectedCamper(camper);
    setSchedule([]);
    setPickerPeriod(null);
    closeConfirm();
    loadSchedule(camper.id);
    refreshCounts();
  }

  // Native-camera scan path: /event-registration?camper={id} preselects
  // that camper on first load. Runs once; the param going stale later
  // (after Back to search) is fine — it only exists to make the scan land.
  useEffect(() => {
    if (!initialCamperId) return;
    const camper = campers.find((row) => row.id === initialCamperId);
    if (camper) {
      openCamper(camper);
    } else {
      pushToast("red", "The scanned camper isn't in this session.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-app scanner result. Returns whether the value was accepted so the
  // scanner knows to stop (found) or keep looking (unknown QR).
  function handleScan(value: string): boolean {
    const camperId = camperIdFromQrValue(value);
    if (!camperId) return false;
    const camper = campers.find((row) => row.id === camperId);
    if (!camper) {
      pushToast("red", "That card's camper isn't in this session.");
      return false;
    }
    setScannerOpen(false);
    openCamper(camper);
    pushToast("green", `Scanned ${camper.name}.`);
    return true;
  }

  function closeConfirm() {
    setPendingOffering(null);
    setRejection(null);
    setOverrideName("");
  }

  async function submitRegistration(options: { override?: boolean; joinWaitlist?: boolean }) {
    if (!selectedCamper || !pendingOffering || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camperId: selectedCamper.id,
          offeringId: pendingOffering.id,
          override: Boolean(options.override),
          overrideApprovedBy: options.override ? overrideName.trim() : "",
          joinWaitlist: Boolean(options.joinWaitlist)
        })
      });
      if (response.status === 401) return handleUnauthorized();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRejection({ error: data.error ?? "Registration was rejected.", waitlistAvailable: Boolean(data.waitlistAvailable) });
        return;
      }
      const spanNote = data.spannedInto ? ` (also fills ${data.spannedInto})` : "";
      pushToast(data.waitlisted ? "amber" : "green", data.waitlisted ? `${selectedCamper.name} added to the ${pendingOffering.activity} waitlist.` : `${selectedCamper.name} → ${pendingOffering.activity} ${pendingOffering.period}${spanNote}`);
      (data.warnings ?? []).forEach((warning: string) => pushToast("amber", warning));
      closeConfirm();
      setPickerPeriod(null);
      loadSchedule(selectedCamper.id);
      refreshCounts();
    } catch {
      pushToast("red", "Network hiccup — the registration may not have saved. Check the card.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRegistration(entry: ScheduleEntry) {
    if (!selectedCamper || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/registration?registrationId=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      if (response.status === 401) return handleUnauthorized();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        pushToast("red", data.error ?? "Couldn't remove that registration.");
        return;
      }
      pushToast("green", `Removed ${entry.activity} (${entry.period})${data.alsoRemovedPartner ? " and its paired period" : ""}.`);
      setRemoveTarget(null);
      loadSchedule(selectedCamper.id);
      refreshCounts();
    } catch {
      pushToast("red", "Network hiccup — check the card before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveEvent() {
    await fetch("/api/event/leave", { method: "POST" }).catch(() => null);
    router.push("/join");
    router.refresh();
  }

  const scheduleByPeriod = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    schedule.forEach((entry) => map.set(entry.period, entry));
    return map;
  }, [schedule]);

  const pickerOfferings = useMemo(() => {
    if (!pickerPeriod || !selectedCamper) return [];
    const rows = offerings.filter((offering) => offering.period === pickerPeriod);
    const isEligible = (offering: OfferingRow) => {
      const unitOk = !offering.eligibleUnits.length || offering.eligibleUnits.includes(selectedCamper.unit);
      const swimOk = !offering.eligibleSwimCodes.length || offering.eligibleSwimCodes.includes(selectedCamper.swim);
      return unitOk && swimOk;
    };
    const hasRoom = (offering: OfferingRow) => offering.limit == null || offering.count < offering.limit;
    return rows
      .map((offering) => ({ offering, eligible: isEligible(offering), open: hasRoom(offering) }))
      .sort((left, right) => {
        // Registrable-right-now first, then eligible-but-full, then the rest.
        const score = (row: { eligible: boolean; open: boolean }) => (row.eligible && row.open ? 0 : row.eligible ? 1 : 2);
        return score(left) - score(right) || left.offering.area.localeCompare(right.offering.area) || left.offering.activity.localeCompare(right.offering.activity);
      });
  }, [pickerPeriod, offerings, selectedCamper]);

  function slotButton(period: string) {
    const entry = scheduleByPeriod.get(period);
    if (entry) {
      return (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-200 bg-forest-50 p-3" key={period}>
          <div className="min-w-0">
            <div className="text-xs font-black text-forest-700">{period}{entry.isTeachingAssistant ? " • TA" : ""}</div>
            <div className="truncate text-sm font-black text-forest-900">{entry.activity}</div>
            <div className="truncate text-xs font-semibold text-slate-600">{entry.area}</div>
          </div>
          <button
            aria-label={`Remove ${entry.activity}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"
            onClick={() => setRemoveTarget(entry)}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      );
    }
    return (
      <button
        className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-left"
        key={period}
        onClick={() => {
          setPickerPeriod(period);
          closeConfirm();
          refreshCounts();
        }}
        type="button"
      >
        <span className="text-sm font-black text-slate-500">{period} — open</span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-lake-600 px-3 py-1.5 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" />Add</span>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-20 border-b border-forest-800 bg-forest-900 px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{eventName}</div>
            <div className="truncate text-xs font-semibold text-forest-100">{guestName} • {windowLabel}</div>
          </div>
          <button className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-forest-600 px-3 text-xs font-black text-forest-50" onClick={leaveEvent} type="button">
            <LogOut className="h-3.5 w-3.5" />Leave
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-4">
        {!selectedCamper ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  className="min-h-14 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-lake-500"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search camper name or cabin..."
                  value={search}
                />
              </div>
              <button
                aria-label="Scan a camper card"
                className="flex min-h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-forest-700 text-white shadow-sm"
                onClick={() => setScannerOpen(true)}
                type="button"
              >
                <ScanLine className="h-6 w-6" />
                <span className="text-[10px] font-black uppercase">Scan</span>
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {search.trim().length < 2 ? (
                <p className="px-1 pt-6 text-center text-sm font-semibold text-slate-500">Type at least two letters of a camper&apos;s name (or their cabin) to get started.</p>
              ) : !searchResults.length ? (
                <p className="px-1 pt-6 text-center text-sm font-semibold text-slate-500">No campers match &quot;{search.trim()}&quot;.</p>
              ) : (
                searchResults.map((camper) => (
                  <button
                    className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm"
                    key={camper.id}
                    onClick={() => openCamper(camper)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-base font-black text-forest-900">{camper.name}{camper.counselorAssistant ? " • CA" : ""}</div>
                      <div className="truncate text-xs font-semibold text-slate-600">{camper.cabin} • {camper.unit} • {genderShort(camper.gender)} • Swim {camper.swim}</div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-black text-slate-700" onClick={() => setSelectedCamper(null)} type="button">
                <ArrowLeft className="h-4 w-4" />Back to search
              </button>
              <button className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-sm font-black text-white" onClick={() => setScannerOpen(true)} type="button">
                <ScanLine className="h-4 w-4" />Scan next card
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xl font-black text-forest-900">{selectedCamper.name}{selectedCamper.counselorAssistant ? " • CA" : ""}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-600">{selectedCamper.cabin} • {selectedCamper.unit} • Swim {selectedCamper.swim}</div>
            </div>
            {scheduleLoading ? <p className="mt-4 text-center text-sm font-semibold text-slate-500">Loading card...</p> : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <section>
                  <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-forest-900">A Day</h2>
                  <div className="space-y-2">{A_PERIODS.map((period) => slotButton(period))}</div>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-forest-900">B Day</h2>
                  <div className="space-y-2">{B_PERIODS.map((period) => slotButton(period))}</div>
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {scannerOpen ? <QrScanner onClose={() => setScannerOpen(false)} onDetect={handleScan} /> : null}

      {pickerPeriod && selectedCamper ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => { setPickerPeriod(null); closeConfirm(); }}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-forest-900">Period {pickerPeriod} • {selectedCamper.name}</h3>
              <button aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600" onClick={() => { setPickerPeriod(null); closeConfirm(); }} type="button"><X className="h-5 w-5" /></button>
            </div>

            {pendingOffering ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-black text-forest-900">{pendingOffering.activity}</div>
                <div className="text-sm font-semibold text-slate-600">{pendingOffering.area} • {pendingOffering.period}{pendingOffering.spansTwoPeriods ? " • runs two periods" : ""}</div>
                {!rejection ? (
                  <div className="mt-3 flex gap-2">
                    <button className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-forest-700 text-base font-black text-white disabled:opacity-50" disabled={busy} onClick={() => submitRegistration({})} type="button">
                      <Check className="h-5 w-5" />{busy ? "Saving..." : "Register"}
                    </button>
                    <button className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-black text-slate-700" onClick={closeConfirm} type="button">Cancel</button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{rejection.error}
                    </div>
                    {rejection.waitlistAvailable ? (
                      <button className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-amber-500 text-base font-black text-white disabled:opacity-50" disabled={busy} onClick={() => submitRegistration({ joinWaitlist: true })} type="button">
                        {busy ? "Saving..." : "Join the waitlist"}
                      </button>
                    ) : null}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700" htmlFor="override-name">Area Head approving this override</label>
                      <input className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-lake-500" id="override-name" maxLength={60} onChange={(event) => setOverrideName(event.target.value)} placeholder="Area Head name" value={overrideName} />
                      <button className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-red-600 text-base font-black text-white disabled:opacity-40" disabled={busy || overrideName.trim().length < 2} onClick={() => submitRegistration({ override: true })} type="button">
                        {busy ? "Saving..." : "Override & register"}
                      </button>
                    </div>
                    <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 text-sm font-black text-slate-700" onClick={closeConfirm} type="button">Back to the list</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {!pickerOfferings.length ? <p className="py-6 text-center text-sm font-semibold text-slate-500">No classes are offered in {pickerPeriod}.</p> : null}
                {pickerOfferings.map(({ offering, eligible, open }) => {
                  const full = !open;
                  return (
                    <button
                      className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${eligible && open ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-80"}`}
                      key={offering.id}
                      onClick={() => { setPendingOffering(offering); setRejection(null); setOverrideName(""); }}
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-forest-900">{offering.activity}{offering.spansTwoPeriods ? " (2 periods)" : ""}</div>
                        <div className="truncate text-xs font-semibold text-slate-600">
                          {offering.area}
                          {offering.eligibleUnits.length ? ` • ${offering.eligibleUnits.join("/")}` : ""}
                          {offering.eligibleSwimLabels.length ? ` • Swim: ${offering.eligibleSwimLabels.join("/")}` : ""}
                        </div>
                        {!eligible ? <div className="text-xs font-black text-amber-700">Outside this camper&apos;s unit/swim — needs an override</div> : null}
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black ${full ? "bg-red-100 text-red-700" : "bg-forest-100 text-forest-800"}`}>
                        {offering.count}{offering.limit != null ? `/${offering.limit}` : ""}{full ? " FULL" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {removeTarget && selectedCamper ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4" onClick={() => setRemoveTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-black text-forest-900">Remove {removeTarget.activity}?</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{selectedCamper.name} • {removeTarget.period} • {removeTarget.area}. Two-period classes are removed as a pair.</p>
            <div className="mt-4 flex gap-2">
              <button className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-red-600 text-base font-black text-white disabled:opacity-50" disabled={busy} onClick={() => removeRegistration(removeTarget)} type="button">{busy ? "Removing..." : "Remove"}</button>
              <button className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-black text-slate-700" onClick={() => setRemoveTarget(null)} type="button">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            className={`rounded-xl border p-3 text-sm font-black shadow-lg ${toast.tone === "green" ? "border-forest-300 bg-forest-50 text-forest-900" : toast.tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900"}`}
            key={toast.id}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </main>
  );
}
