import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is bound on 0.0.0.0, so a browser at 127.0.0.1 is otherwise
  // treated as cross-site and Next answers /_next requests with a bare
  // "Unauthorized", which breaks hydration.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/**": ["./sources/**/*"],
  },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
