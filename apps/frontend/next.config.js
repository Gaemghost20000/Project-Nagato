/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // If your frontend needs to access services in the monorepo during build time or SSR,
  // you might need to configure outputStandalone or transpilePackages.
  // transpilePackages: ['@ai-dev-agent/shared'], // Example if 'shared' is used
};

module.exports = nextConfig;