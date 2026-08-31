import type { NextConfig } from "next";

const buildTarget = process.env.NUME_BUILD_TARGET || "";
const isGitHubPages = buildTarget === "github-pages";
const isCloudflarePages = buildTarget === "cloudflare-pages";
const isStaticExport = isGitHubPages || isCloudflarePages;
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) || "NUmE-platform";
const requestedBase = process.env.NUME_PAGES_BASE_PATH?.replace(/^\/+|\/+$/g, "");
const basePath = isGitHubPages ? `/${requestedBase || repositoryName}` : "";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      trailingSlash: true,
      ...(isGitHubPages ? { basePath, assetPrefix: basePath } : {}),
      env: {
        NEXT_PUBLIC_BASE_PATH: basePath,
        NEXT_PUBLIC_NUME_TARGET: isGitHubPages ? "github-pages" : "cloudflare-pages",
      },
      images: { unoptimized: true },
      typescript: { tsconfigPath: "./tsconfig.pages.json" },
    }
  : {
      env: {
        NEXT_PUBLIC_BASE_PATH: "",
        NEXT_PUBLIC_NUME_TARGET: "cloudflare",
      },
    };

export default nextConfig;
