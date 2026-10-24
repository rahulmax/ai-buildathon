import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads the workspace cookie, so pages render per request.
  cacheComponents: false,
  // The schema is read at runtime to migrate on first request.
  outputFileTracingIncludes: { '/**': ['./db/schema.sql'] },
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
