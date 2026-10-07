import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { footerVersion } from "./scripts/footerVersion.mjs";

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version?: string };

function readCommitCount(): string | null {
  const git = (args: string) =>
    execSync(`git ${args}`, {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

  try {
    const shallow = git("rev-parse --is-shallow-repository") === "true";
    if (shallow && process.env.VERCEL) {
      try {
        execSync("git fetch --unshallow", {
          cwd: __dirname,
          stdio: "ignore",
        });
      } catch {
        console.warn(
          "[footer-version] unshallow failed; using package.json version",
        );
        return null;
      }
    }
    const count = git("rev-list --count HEAD");
    return count || null;
  } catch {
    return null;
  }
}

const appVersion = footerVersion(pkg.version, readCommitCount());
const gitCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.GIT_COMMIT_SHA?.trim() ||
  "";

export default defineConfig({
  appType: "spa",
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    "import.meta.env.VITE_GIT_COMMIT_SHA": JSON.stringify(gitCommitSha),
  },

  build: {
    outDir: "dist",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@revenuecat")) return "revenuecat";
          if (id.includes("node_modules/react-share")) return "share";
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("node_modules/@radix-ui/")) return "radix";
          if (id.includes("node_modules/lucide-react")) return "lucide";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "react-paginate",
    ],
  },

  server: {
    port: 8080,
    host: true,
    watch: {
      // `cap copy` writes the bundle into the native projects; watching them triggers reload loops
      // during `pnpm dev:ios`.
      ignored: ["**/ios/**", "**/android/**"],
    },
    proxy: {
      "/api": {
        target:
          process.env.VITE_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:10000",
        changeOrigin: true,
      },
    },
  },
});
