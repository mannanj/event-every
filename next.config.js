/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  allowedDevOrigins: ['event-every.local'],
  output: 'export',
  images: { unoptimized: true },
}

module.exports = nextConfig
