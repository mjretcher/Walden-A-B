/** @type {import('next').NextConfig} */

/**
 * HTTP security headers applied to every response.
 *
 * These prevent common browser-side attacks: clickjacking (X-Frame-Options),
 * MIME-type confusion (X-Content-Type-Options), referrer leakage to
 * external sites (Referrer-Policy), unwanted device-feature access
 * (Permissions-Policy), and TLS downgrade (Strict-Transport-Security).
 *
 * NOT added: a full Content-Security-Policy. Next.js apps with inline
 * scripts and styles need a carefully crafted CSP, and a too-strict one
 * breaks the dev experience and third-party widgets. We can layer that
 * in later once the app's resource list is stable.
 */
const securityHeaders = [
  // Browsers should never frame this site (clickjacking defense).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers guess MIME types from content.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the path of internal pages when staff click external links.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser device-feature APIs the app doesn't use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // HSTS: force HTTPS on every subdomain for the next 2 years and preload
  // the policy. Vercel terminates TLS, so this is safe and prevents any
  // accidental http:// link from being trusted.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Defense-in-depth XSS filter for older browsers.
  { key: "X-XSS-Protection", value: "1; mode=block" }
];

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb"
    }
  },
  outputFileTracingIncludes: {
    "/admin/import/q1-cabins": ["./data/q1-assignments.json"]
  },
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async headers() {
    return [
      {
        // Apply to every route (Next.js path syntax).
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
