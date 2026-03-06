/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  allowedDevOrigins: ['event-every.local'],
  images: { unoptimized: true },
}

module.exports = nextConfig
