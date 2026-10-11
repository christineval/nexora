import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/products", destination: "/inventory/products", permanent: true },
      { source: "/purchases", destination: "/purchasing", permanent: true },
      { source: "/report", destination: "/reports", permanent: true },
    ];
  },
};
export default nextConfig;
