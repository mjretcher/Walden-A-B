import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Title template: pages that set their own metadata.title via Next.js
  // route metadata get prefixed automatically as
  //   "<Page Title> | Camp Walden A/B"
  // Pages that don't set a title fall through to the default below.
  // Per-page titles help screen-reader users hear where they are when
  // they navigate between routes.
  title: {
    default: "Camp Walden A/B",
    template: "%s | Camp Walden A/B"
  },
  description: "Internal A/B registration and staff assignment operations app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
         * Skip-to-main link. Hidden visually until a keyboard user Tabs
         * to it (it's the first focusable element on every page), at
         * which point it appears in the top-left corner. Clicking or
         * pressing Enter jumps focus past the sidebar navigation to the
         * main content area. Zero visual impact for mouse users.
         */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:text-white focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-lake-300"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
