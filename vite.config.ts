// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 8080,
      host: "0.0.0.0",
    },
    resolve: {
      alias: {
        // Internal Shuffle libraries vendored under src/ — point directly to source entries
        "@/Shuffle-Core": path.resolve(dirname, "./src/Shuffle-Core/index.tsx"),
        "@shuffleio/shuffle-mcps": path.resolve(dirname, "./src/Shuffle-MCPs/index.ts"),
        "@shuffleio/shuffle-core": path.resolve(dirname, "./src/Shuffle-Core/index.tsx"),
      },
    },
  },
});
