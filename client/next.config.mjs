import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // src/vendor/shared is byte-identical mirrored from the server copy, which
  // writes relative imports with a literal `.js` extension (required by
  // server's Node/tsx ESM execution — see server/AGENTS.md). Webpack's
  // bundler resolution needs an explicit alias to follow those `.js`
  // specifiers to the actual `.ts`/`.tsx` source files.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
