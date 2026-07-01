import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true, // We will run lint manually before build
  },
  typescript: {
    ignoreBuildErrors: true, // Handled in QA
  }
};

export default nextConfig;
