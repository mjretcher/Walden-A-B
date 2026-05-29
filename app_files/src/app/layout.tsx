import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camp Walden A/B",
  description: "Internal A/B registration and staff assignment operations app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
