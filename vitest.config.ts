import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // DB integration tests share a single PostgreSQL instance — run files sequentially
    // to avoid concurrent DELETE/INSERT races between test files.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only 是 Next.js 提供的运行时守卫，单测环境下 stub 成空模块
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
