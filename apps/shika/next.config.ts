import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    // Keep Windows builds off the child-process worker path that resets IPC connections.
    cpus: 1,
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
