import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unbzip2-stream", "unpdf"],
  poweredByHeader: false,
};

export default nextConfig;
