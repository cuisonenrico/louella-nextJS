import type { NextConfig } from "next";

/**
 * Packages that must be `require`d at runtime rather than bundled.
 *
 * Nest and its ecosystem resolve modules dynamically — optional peer deps in
 * try/catch, decorator metadata lookups, `class-transformer/storage` reached
 * through a bare require. A bundler cannot see any of that statically, so
 * bundling them produces "Module not found" at build time or missing metadata
 * at runtime.
 *
 * Next already externalises `@prisma/client`, `express`, `bcrypt`,
 * `firebase-admin`, and `@aws-sdk/*` by default, so they are not repeated here.
 */
const nestPackages = [
  "@nestjs/cache-manager",
  "@nestjs/common",
  "@nestjs/config",
  "@nestjs/core",
  "@nestjs/jwt",
  "@nestjs/mapped-types",
  "@nestjs/passport",
  "@nestjs/platform-express",
  "@nestjs/swagger",
  "@nestjs/throttler",
  "cache-manager",
  "class-transformer",
  "class-validator",
  "cookie-parser",
  "passport",
  "passport-jwt",
  "reflect-metadata",
  "xlsx",
];

/**
 * Security headers formerly applied by helmet inside the Nest bootstrap.
 *
 * This is helmet's default set reproduced verbatim, so responses carry the
 * same headers they did when the API ran on Cloud Run. They now cover the
 * whole site rather than just the API, which is a genuine gain from
 * consolidating: the Vercel-hosted pages previously got none of them.
 *
 * `crossOriginEmbedderPolicy` stays off, matching the old helmet options.
 *
 * Deliberately omitted: Content-Security-Policy. Helmet's old policy
 * (`default-src 'self'`) was safe for a JSON-only API but would break the
 * Next.js app, whose inline bootstrap scripts need either 'unsafe-inline' or
 * per-request nonces. A nonce-based CSP is worth doing, but it is its own
 * piece of work — shipping a broken or toothless one here helps nobody.
 */
const securityHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only enforced by browsers for no-cors subresource loads, so it does not
  // affect the Flutter client or any CORS-enabled fetch of the API.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Download-Options", value: "noopen" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Intentionally "0": the legacy XSS auditor is disabled, not enabled — its
  // heuristics introduced vulnerabilities of their own. This is helmet's value.
  { key: "X-XSS-Protection", value: "0" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: nestPackages,
  // helmet used to strip Express's `X-Powered-By`; without this Next would
  // reintroduce the same disclosure with its own value.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
