// EE_E2E_WRANGLER_CONFIG points `next dev` at a generated wrangler config with an
// isolated local state (playwright.linked-apps.config.ts). Unset, nothing changes.
const e2eWrangler = process.env.EE_E2E_WRANGLER_CONFIG;
import('@opennextjs/cloudflare').then((module) =>
  module.initOpenNextCloudflareForDev(
    e2eWrangler ? { configPath: e2eWrangler, persist: { path: '.wrangler/e2e-state/v3' } } : undefined,
  ),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  allowedDevOrigins: ['event-every.local'],
  images: { unoptimized: true },
}

module.exports = nextConfig
