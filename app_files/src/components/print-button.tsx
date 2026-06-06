"use client";

import { Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/ui";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button className={`${secondaryButtonClass} no-print`} onClick={() => window.print()} type="button">
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
