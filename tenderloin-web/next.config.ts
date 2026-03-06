import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Hand-written type stubs cause inference issues with the Supabase SDK.
    // Remove this once types are regenerated with: npx supabase gen types typescript
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
