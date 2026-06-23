"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const refreshMs = 5000;

export function StaffScheduleAutoRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState("starting");

  useEffect(() => {
    function refresh() {
      router.refresh();
      setLastRefresh(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    }

    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, refreshMs);

    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-black text-forest-800">
      <RefreshCw className="h-4 w-4" />
      Auto-refresh {lastRefresh}
    </span>
  );
}
