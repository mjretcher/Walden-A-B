"use client";

import { useEffect } from "react";

/**
 * Wires the "Print sign-in card" button (marked with data-print-signin,
 * rendered server-side so it appears inside the QR panel) to a print run
 * scoped to the .signin-print-card handout only. Adds a temporary @page
 * portrait rule so the half-page card prints upright regardless of the
 * site-wide landscape default.
 */
export function PrintSigninButton() {
  useEffect(() => {
    const button = document.querySelector<HTMLButtonElement>("[data-print-signin]");
    if (!button) return;
    function handlePrint() {
      const style = document.createElement("style");
      style.id = "__signin-print-page";
      style.textContent = "@page { size: letter portrait; margin: 0.5in; }";
      document.head.appendChild(style);
      document.body.classList.add("printing-signin");
      const cleanup = () => {
        document.body.classList.remove("printing-signin");
        document.getElementById("__signin-print-page")?.remove();
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    }
    button.addEventListener("click", handlePrint);
    return () => button.removeEventListener("click", handlePrint);
  }, []);

  return null;
}
