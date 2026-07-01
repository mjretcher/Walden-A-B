"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { inputClass } from "@/components/ui";

export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative">
      <input
        className={`${inputClass} min-h-12 w-full pr-11 text-base`}
        name="password"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        placeholder="Enter your password"
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lake-400"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </span>
  );
}
